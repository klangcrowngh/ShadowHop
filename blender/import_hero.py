"""Готовит присланную модель героя для игры: models/hero.glb.

  * исходник: blender/source/hero_source.glb (копия присланного файла);
  * масштаб до роста HEIGHT, ноги на z = 0, центр по X/Y в нуле;
  * лицом в -Y Blender (у исходника так и есть);
  * два светящихся глаза (материал "Eye") на поверхности лица в глубине
    капюшона: точка ставится лучом, пущенным спереди;
  * текстура исходника сохраняется.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/import_hero.py
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "blender", "source", "hero_source.glb")
OUT = os.path.join(ROOT, "models", "hero.glb")

HEIGHT = 0.95
# Глаза в долях исходной модели: высота (0 — низ, 1 — макушка) и полуразнос по X
# относительно ширины модели. Подобрано по виду спереди: полоса кожи в капюшоне.
EYE_H = 0.695
EYE_X = 0.14
EYE_R = 0.024      # радиус глаза после масштаба
EYE_OUT = 0.006    # насколько глаз выступает из поверхности лица

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = next(o for o in bpy.data.objects if o.type == "MESH")
mesh.name = "Hero"

# --- нормализация ------------------------------------------------------------
bpy.context.view_layer.update()
pts = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
k = HEIGHT / (hi.z - lo.z)
width = (hi.x - lo.x) * k
mesh.scale = mesh.scale * k
mesh.location = Vector((-(lo.x + hi.x) / 2 * k, -(lo.y + hi.y) / 2 * k, -lo.z * k))
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.context.view_layer.update()

# --- глаза: луч спереди (из -Y) в сторону +Y до поверхности лица ------------------
depsgraph = bpy.context.evaluated_depsgraph_get()
eye_mat = bpy.data.materials.new("Eye")
eye_mat.diffuse_color = (1, 1, 1, 1)
tree = getattr(eye_mat, "node_tree", None)
bsdf = tree.nodes.get("Principled BSDF") if tree else None
if bsdf:
    bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Emission Strength"].default_value = 4.0

eyes = []
z = EYE_H * HEIGHT
for s in (-1, 1):
    x = s * EYE_X * width
    hit, loc, normal, _, _, _ = bpy.context.scene.ray_cast(depsgraph, Vector((x, -3, z)), Vector((0, 1, 0)))
    if not hit:
        raise SystemExit(f"луч не попал в лицо в точке x={x:.3f} z={z:.3f}")
    print(f"eye {s}: face at y={loc.y:.3f}")
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=EYE_R,
                                         location=loc + Vector((0, -EYE_OUT, 0)))
    eye = bpy.context.view_layer.objects.active
    eye.scale = (1.0, 0.55, 0.8)       # приплюснутый овал
    eye.rotation_euler = (0, s * 0.18, 0)  # чуть раскосые
    eye.data.materials.append(eye_mat)
    eyes.append(eye)

bpy.ops.object.select_all(action="DESELECT")
for e in eyes:
    e.select_set(True)
bpy.context.view_layer.objects.active = eyes[0]
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active
joined.name = "Eyes"
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.shade_smooth()

# --- нашивка Rentrobot на рюкзаке: объёмная эмблема «RR» в кольце ------------------
LOGO_SVG = os.path.join(ROOT, "assets", "emblem.svg")
LOGO_SIZE = 0.11     # диаметр нашивки
LOGO_DEPTH = 0.006   # толщина

import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402

before = {o.name for o in bpy.data.objects}
bpy.ops.import_curve.svg(filepath=LOGO_SVG)
curves = [o for o in bpy.data.objects if o.name not in before]
# кольцо импортируется сплошным диском — берём от него только центр и радиус
disc = max(curves, key=lambda o: o.dimensions.x)
letters = [o for o in curves if o is not disc]
bpy.context.view_layer.update()
dpts = [disc.matrix_world @ Vector(c) for c in disc.bound_box]
center = sum(dpts, Vector()) / 8
r_mid = disc.dimensions.x / 2                  # радиус окружности кольца (175 в единицах SVG)
half_w = r_mid * 10 / 175                       # половина толщины обводки (20/2)
bpy.data.objects.remove(disc)

parts = []
for o in letters:
    o.data.extrude = LOGO_DEPTH / 2
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    parts.append(bpy.context.view_layer.objects.active)

bm = bmesh.new()
n = 64
outer = [bm.verts.new((center.x + (r_mid + half_w) * math.cos(a), center.y + (r_mid + half_w) * math.sin(a), 0))
         for a in [i / n * math.tau for i in range(n)]]
inner = [bm.verts.new((center.x + (r_mid - half_w) * math.cos(a), center.y + (r_mid - half_w) * math.sin(a), 0))
         for a in [i / n * math.tau for i in range(n)]]
for i in range(n):
    bm.faces.new((outer[i], outer[(i + 1) % n], inner[(i + 1) % n], inner[i]))
ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, LOGO_DEPTH))
bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, 0, -LOGO_DEPTH / 2))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
ring_me = bpy.data.meshes.new("Ring")
bm.to_mesh(ring_me)
ring = bpy.data.objects.new("Ring", ring_me)
bpy.context.collection.objects.link(ring)
parts.append(ring)

logo_mat = bpy.data.materials.new("Logo")
logo_mat.diffuse_color = (1.0, 0.85, 0.6, 1)
for o in parts:
    o.data.materials.clear()
    o.data.materials.append(logo_mat)
bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
logo = bpy.context.view_layer.objects.active
logo.name = "Logo"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# центр эмблемы в ноль, размер LOGO_SIZE
for v in logo.data.vertices:
    v.co = (v.co - Vector((center.x, center.y, 0))) * (LOGO_SIZE / (2 * (r_mid + half_w)))

# рюкзак — самая выступающая назад (+Y) часть спины: ищем лучами сзади
depsgraph = bpy.context.evaluated_depsgraph_get()
# высота середины рюкзака (по виду сзади он занимает ~13–61% роста); глубину даёт луч
LOGO_Z = 0.37
hit, best, normal, _, obj, _ = bpy.context.scene.ray_cast(depsgraph, Vector((0, 3, LOGO_Z * HEIGHT)), Vector((0, -1, 0)))
if not hit:
    raise SystemExit("луч сзади не нашёл рюкзак")
print(f"backpack at z={best.z:.3f} y={best.y:.3f}")
# смотрит назад (+Y); если смотреть на спину героя, эмблема читается правильно
orient = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0))).to_4x4()
# повернуть по наклону поверхности рюкзака и чуть выдвинуть наружу, чтобы не утонула
tilt = Vector((0, 1, 0)).rotation_difference(normal.normalized()).to_matrix().to_4x4()
logo.matrix_world = Matrix.Translation(best + normal.normalized() * 0.016) @ tilt @ orient
bpy.ops.object.select_all(action="DESELECT")
logo.select_set(True)
bpy.context.view_layer.objects.active = logo
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True)
print("exported", OUT)
