"""Генерирует модели Shadow Hop, экспортирует их в models/*.glb
и рендерит превью всех моделей в docs/models.png.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_models.py

Стиль: плотные "кубичные" low-poly модели из крупных деталей с фаской,
цвет — по частям (материалы с именами из PALETTE). Игра подменяет материалы
на свои PBR-материалы по тем же именам (src/materials.js, SURFACES), поэтому
имена материалов здесь и там должны совпадать.

Соглашения:
  * персонажи смотрят в -Y Blender (после экспорта в glTF это +Z three.js);
  * 1 единица = 1 клетка; основание моделей на z = 0;
    у пилы, шестерни, шара и брёвен центр в нуле; у плавучих предметов верх в z ≈ 0;
  * пила/шестерня лежат в плоскости XZ (ось вращения — Y), брёвна вытянуты по X;
  * лапы паука — объекты Leg0..Leg7 (pivot в бедре), рука охотника — объект Arm
    (pivot в плече): их двигает игра;
  * материал "Eye" светится (глаза, фонари, цветы кувшинок).
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "models")
V = Vector

# Имя материала -> цвет (sRGB). Те же имена в src/materials.js.
PALETTE = {
    "Cloak": "#262a33", "Pants": "#2b2a2c", "Boots": "#221a14", "Leather": "#6a4128", "LeatherDark": "#3a2518",
    "Skin": "#b88768", "SkinShade": "#5e4232", "Shadow": "#070708", "Shirt": "#4a5a3a", "Canvas": "#6e5a40", "Beard": "#3b2618",
    "Hat": "#4a3322", "Fur": "#7d5638", "Antler": "#cbb896", "Bone": "#d9d0bd",
    "Wood": "#6e4a31", "WoodDark": "#3e2a1c", "Bark": "#2e2620", "Moss": "#56702f", "Grass": "#4f6a2c",
    "Reed": "#77733d", "CapRed": "#a33c2c", "Stem": "#d8cbb0", "Leaf": "#3d6436",
    "Stone": "#6a6c6f", "StoneDark": "#46484b", "Brick": "#5d514a",
    "Steel": "#50555b", "SteelDark": "#2f3236", "Rust": "#6b3a24", "Coal": "#141414", "Rope": "#8c7450",
    "Chitin": "#0d0d0f", "Eye": "#ffffff",
}


def srgb_to_linear(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    col = srgb_to_linear(PALETTE[name])
    m.diffuse_color = (*col, 1.0)
    tree = getattr(m, "node_tree", None)
    bsdf = tree.nodes.get("Principled BSDF") if tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*col, 1.0)
        if name == "Eye":
            bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
            bsdf.inputs["Emission Strength"].default_value = 3.0
    return m


def M(obj, name):
    """Назначает материал части модели."""
    obj.data.materials.clear()
    obj.data.materials.append(material(name))
    return obj


def active():
    return bpy.context.view_layer.objects.active


# --- Примитивы ---------------------------------------------------------------

def box(size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bev=0.012):
    """Коробка с фаской — основа "кубичного" стиля."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = min(bev, min(size) * 0.3)
    if b > 0.002:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = b
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return M(o, mat) if mat else o


def cone(r1, r2, depth, loc=(0, 0, 0), verts=8, mat=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = active()
    return M(o, mat) if mat else o


def cyl(r, depth, loc=(0, 0, 0), rot=(0, 0, 0), verts=12, mat=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = active()
    return M(o, mat) if mat else o


def sphere(r, loc, scale=(1, 1, 1), seg=12, rings=8, mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = active()
    o.scale = scale
    return M(o, mat) if mat else o


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), seg=16, scale=(1, 1, 1), mat=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=4,
                                     location=loc, rotation=rot)
    o = active()
    o.scale = scale
    return M(o, mat) if mat else o


def limb(p0, p1, r0, r1, verts=6, mat=None):
    """Сужающийся цилиндр от точки p0 к p1."""
    p0, p1 = V(p0), V(p1)
    d = p1 - p0
    o = cone(r0, r1, d.length, (p0 + p1) / 2, verts)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = V((0, 0, 1)).rotation_difference(d.normalized())
    return M(o, mat) if mat else o


def curve_limb(points, r0, r1, verts=6, mat=None):
    """Кривая ветка из нескольких сегментов с плавным сужением."""
    points = [V(p) for p in points]
    out = []
    n = len(points) - 1
    for i in range(n):
        a = r0 + (r1 - r0) * i / n
        b = r0 + (r1 - r0) * (i + 1) / n
        out.append(limb(points[i], points[i + 1], a, b, verts, mat))
        if i:  # шарнир, чтобы не было щелей на изгибе
            out.append(sphere(a, points[i], seg=verts, rings=max(3, verts // 2), mat=mat))
    return out


def jitter(obj, amount, scale=3.0, seed=0):
    """Шумовое смещение вершин вдоль нормали — "органика"."""
    for v in obj.data.vertices:
        n = noise.noise(v.co * scale + V((seed, seed * 1.7, 0)))
        v.co += v.normal * n * amount


def join(objs, name, mat=None, smooth=False):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        if not o.data.materials:
            o.data.materials.append(material(mat or "Shadow"))
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = active()
    o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth() if smooth else bpy.ops.object.shade_flat()
    return o


def set_origin(o, point):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.context.scene.cursor.location = point
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def cog(radius, teeth, thick, tooth=0.1, mat="Rust"):
    """Шестерня в плоскости XZ (ось Y) с квадратными зубьями."""
    bm = bmesh.new()
    pts = []
    for i in range(teeth):
        for k, rr in ((0.0, radius), (0.18, radius), (0.25, radius + tooth), (0.68, radius + tooth), (0.75, radius), (0.93, radius)):
            a = (i + k) / teeth * math.tau
            pts.append(bm.verts.new((math.cos(a) * rr, 0, math.sin(a) * rr)))
    face = bm.faces.new(pts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, thick, 0))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, -thick / 2, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("Cog")
    bm.to_mesh(me)
    o = bpy.data.objects.new("Cog", me)
    bpy.context.collection.objects.link(o)
    return M(o, mat)


def export(name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True)
    print("exported", path)


# =============================================================================
# Персонажи
# =============================================================================

def hero():
    """Герой в капюшоне (гладкий, не кубичный): мягкий капюшон с вырезом, в нём
    лицо со светящимися глазами и шарфом, длинный плащ, ремень через грудь, рюкзак."""
    reset()
    random.seed(11)
    p = []
    for s in (-1, 1):
        p.append(sphere(0.055, (s * 0.06, -0.025, 0.035), (0.85, 1.35, 0.65), 12, 8, "Boots"))
        p += curve_limb([(s * 0.06, 0, 0.05), (s * 0.062, 0.005, 0.16), (s * 0.058, 0, 0.27)], 0.042, 0.048, 12, "Pants")
    # плащ: расширяется книзу, подол волной, сзади чуть длиннее
    cloak = cone(0.215, 0.11, 0.48, (0, 0.01, 0.43), 20, "Cloak")
    for v in cloak.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        if v.co.z < 0:
            v.co.z += math.sin(a * 5) * 0.012 - max(0.0, math.sin(a)) * 0.04
    p.append(cloak)
    p.append(sphere(0.13, (0, 0.0, 0.63), (1.25, 1.05, 0.6), 16, 10, "Cloak"))           # плечи
    for s in (-1, 1):  # рукава и руки в перчатках
        p += curve_limb([(s * 0.13, 0, 0.64), (s * 0.19, -0.01, 0.5), (s * 0.2, -0.05, 0.38)], 0.05, 0.042, 12, "Cloak")
        p.append(sphere(0.036, (s * 0.2, -0.06, 0.35), seg=10, rings=8, mat="LeatherDark"))
    p.append(torus(0.172, 0.018, (0, 0.005, 0.37), seg=24, mat="LeatherDark"))           # пояс
    p.append(sphere(0.055, (0.15, -0.09, 0.34), (1.0, 0.7, 0.9), 10, 8, "Leather"))     # сумка на поясе
    # ремень через грудь: плоская дуга от левого плеча к правому бедру
    strap = curve_limb([(-0.12, -0.1, 0.63), (-0.02, -0.165, 0.52), (0.08, -0.17, 0.42), (0.15, -0.1, 0.36)], 0.022, 0.022, 8, "Leather")
    for o in strap:
        o.scale.y *= 0.45
    p += strap
    p.append(sphere(0.1, (0, 0.17, 0.52), (1.05, 0.6, 1.2), 12, 8, "Canvas"))          # рюкзак
    p.append(cyl(0.035, 0.2, (0, 0.2, 0.66), (0, math.pi / 2, 0), 12, "LeatherDark"))  # скатка
    # голова и лицо
    p.append(sphere(0.145, (0, -0.015, 0.8), (1, 0.95, 1.05), 20, 14, "SkinShade"))  # лицо в тени капюшона
    p.append(sphere(0.125, (0, -0.07, 0.72), (1.12, 0.75, 0.55), 18, 10, "Pants"))      # шарф на лице
    p.append(torus(0.1, 0.035, (0, 0, 0.7), seg=20, mat="Pants"))                         # шарф вокруг шеи
    # капюшон: сфера с вырезом спереди, утолщённая, с кончиком, свисающим назад
    hood = sphere(0.205, (0, 0.02, 0.81), (1, 1.06, 1.1), 24, 16, "Cloak")
    bm = bmesh.new()
    bm.from_mesh(hood.data)
    cut = [v for v in bm.verts if v.co.y < -0.06 and -0.16 < v.co.z < 0.12 and abs(v.co.x) < 0.16]
    bmesh.ops.delete(bm, geom=cut, context="VERTS")
    for v in bm.verts:  # макушка чуть заострена и оттянута назад
        if v.co.z > 0.12:
            v.co.z += (v.co.z - 0.12) * 0.5
            v.co.y += (v.co.z - 0.12) * 0.4
    bm.to_mesh(hood.data)
    bm.free()
    mod = hood.modifiers.new("Solid", "SOLIDIFY")
    mod.thickness = 0.04
    bpy.context.view_layer.objects.active = hood
    bpy.ops.object.modifier_apply(modifier=mod.name)
    p.append(hood)
    p += curve_limb([(0, 0.18, 0.88), (0, 0.24, 0.82), (0, 0.26, 0.74)], 0.06, 0.01, 12, "Cloak")
    join(p, "Hero", smooth=True)
    eyes = [sphere(0.026, (s * 0.052, -0.148, 0.805), (1, 0.7, 1.05), 12, 8, "Eye") for s in (-1, 1)]
    join(eyes, "Eyes", smooth=True)
    export("hero")


def hunter(zone, weapon):
    """Охотник: шляпа, борода, зелёная рубаха, кожаный жилет, рюкзак со скаткой.
    Правая рука с оружием — объект Arm с pivot в плече (игра делает замах)."""
    reset()
    random.seed(41)
    p = []
    for s in (-1, 1):
        p.append(box((0.1, 0.14, 0.08), (s * 0.065, -0.015, 0.04), mat="Boots"))
        p.append(box((0.085, 0.09, 0.26), (s * 0.065, 0, 0.21), mat="Pants"))
    p.append(box((0.26, 0.16, 0.3), (0, 0, 0.54), mat="Shirt"))
    for s in (-1, 1):
        p.append(box((0.1, 0.175, 0.25), (s * 0.08, -0.004, 0.55), mat="Leather"))            # жилет
    p.append(box((0.285, 0.185, 0.045), (0, 0, 0.405), mat="LeatherDark"))                    # пояс
    p.append(box((0.04, 0.02, 0.035), (0, -0.095, 0.405), mat="Steel"))                        # пряжка
    p.append(box((0.07, 0.05, 0.07), (0.11, -0.1, 0.37), mat="Leather"))                       # подсумок
    p.append(box((0.22, 0.12, 0.26), (0, 0.15, 0.58), mat="Canvas"))                           # рюкзак
    p.append(cyl(0.05, 0.27, (0, 0.15, 0.74), (0, math.pi / 2, 0), 8, "Cloak"))               # скатка
    for s in (-1, 1):
        p.append(box((0.03, 0.02, 0.28), (s * 0.08, -0.085, 0.58), mat="LeatherDark"))       # лямки
    p.append(box((0.08, 0.08, 0.05), (0, 0, 0.715), mat="Skin"))                               # шея
    p.append(box((0.2, 0.19, 0.2), (0, 0, 0.83), mat="Skin", bev=0.03))                        # голова
    p.append(box((0.2, 0.06, 0.11), (0, -0.09, 0.765), mat="Beard", bev=0.02))                 # борода
    p.append(box((0.13, 0.03, 0.03), (0, -0.1, 0.815), mat="Beard"))                           # усы
    p.append(box((0.045, 0.045, 0.055), (0, -0.108, 0.845), mat="Skin"))                       # нос
    for s in (-1, 1):
        p.append(box((0.06, 0.02, 0.018), (s * 0.05, -0.1, 0.895), mat="Beard"))              # брови
    brim = cyl(0.21, 0.025, (0, 0, 0.94), verts=16, mat="Hat")
    for v in brim.data.vertices:  # мятые поля
        v.co.z += math.sin(math.atan2(v.co.y, v.co.x) * 2) * 0.018
    p.append(brim)
    p.append(box((0.18, 0.17, 0.11), (0, 0, 1.0), mat="Hat", bev=0.025))
    p.append(box((0.186, 0.176, 0.03), (0, 0, 0.965), mat="LeatherDark"))                     # лента
    p.append(box((0.075, 0.08, 0.24), (-0.17, 0, 0.56), (0, -0.12, 0), mat="Shirt"))          # левая рука
    p.append(sphere(0.036, (-0.19, 0, 0.43), seg=8, rings=6, mat="Skin"))
    join(p, "Hunter")
    eyes = [sphere(0.02, (s * 0.045, -0.097, 0.868), seg=8, rings=6, mat="Eye") for s in (-1, 1)]
    join(eyes, "Eyes", smooth=True)

    hand = V((0.18, -0.19, 0.55))
    arm = [box((0.075, 0.08, 0.14), (0.17, -0.02, 0.62), mat="Shirt"),
           box((0.07, 0.16, 0.07), (0.18, -0.1, 0.55), mat="Shirt"),
           sphere(0.036, hand, seg=8, rings=6, mat="Skin")]
    if weapon == "spear":
        arm.append(limb(hand + V((0, 0.45, 0)), hand + V((0, -0.55, 0)), 0.018, 0.016, 6, "Wood"))
        arm.append(limb(hand + V((0, -0.55, 0)), hand + V((0, -0.74, 0)), 0.04, 0.002, 4, "Steel"))
        arm.append(torus(0.022, 0.009, hand + V((0, -0.52, 0)), (math.pi / 2, 0, 0), 8, mat="LeatherDark"))
    elif weapon == "blowpipe":
        arm.append(limb(hand + V((0, 0.22, 0.01)), hand + V((0, -0.58, 0.03)), 0.024, 0.02, 8, "WoodDark"))
        for k in (0.12, -0.2, -0.45):  # обмотка
            arm.append(torus(0.027, 0.009, hand + V((0, k, 0.02)), (math.pi / 2, 0, 0), 8, mat="Leather"))
    elif weapon == "crossbow":
        arm.append(box((0.05, 0.42, 0.05), hand + V((0, -0.12, 0.02)), mat="Wood"))
        arm += curve_limb([hand + V((-0.2, -0.28, 0.02)), hand + V((0, -0.34, 0.02)), hand + V((0.2, -0.28, 0.02))], 0.016, 0.016, 5, "Steel")
        arm.append(limb(hand + V((-0.2, -0.28, 0.02)), hand + V((0.2, -0.28, 0.02)), 0.004, 0.004, 3, "Rope"))
        arm.append(limb(hand + V((0, -0.05, 0.05)), hand + V((0, -0.3, 0.05)), 0.008, 0.008, 4, "WoodDark"))  # болт на ложе
    elif weapon == "sling":
        arm.append(limb(hand, hand + V((0, 0.05, -0.28)), 0.007, 0.007, 3, "Leather"))
        arm.append(sphere(0.05, hand + V((0, 0.05, -0.3)), (1, 1, 0.7), 8, 6, "Stone"))
    o = join(arm, "Arm")
    set_origin(o, (0.17, 0, 0.68))
    export(f"hunter_{zone}")


def spider():
    """Паук: тело + 8 лап отдельными объектами Leg0..Leg7 с pivot в бедре
    (лапа вытянута вдоль локального +X), чтобы игра могла их сгибать."""
    reset()
    random.seed(23)
    scene = bpy.context.scene
    ceph = sphere(0.2, (0, -0.12, 0), (1, 1.15, 0.8), 16, 10, "Chitin")
    abdomen = sphere(0.34, (0, 0.38, 0.06), (0.95, 1.2, 0.85), 18, 12, "Chitin")
    jitter(abdomen, 0.02, 5, 3)
    parts = [ceph, abdomen]
    for s in (-1, 1):  # хелицеры-клыки
        parts += curve_limb([(s * 0.06, -0.3, -0.02), (s * 0.07, -0.38, -0.1), (s * 0.03, -0.4, -0.2)], 0.035, 0.005, 5, "Bone")
    for i in range(30):  # щетина на брюшке
        a, b = random.uniform(0, math.tau), random.uniform(0.2, 1.4)
        n = V((math.cos(a) * math.sin(b) * 0.95, math.sin(a) * math.sin(b) * 1.2, math.cos(b) * 0.85)).normalized()
        base = V((0, 0.38, 0.06)) + V((n.x * 0.32, n.y * 0.4, n.z * 0.29))
        parts.append(limb(base, base + n * random.uniform(0.06, 0.12), 0.012, 0.001, 3, "Chitin"))
    join(parts, "Body", smooth=True)
    eyes = []
    for x, y, z, r in [(-0.06, -0.3, 0.07, 0.03), (0.06, -0.3, 0.07, 0.03), (-0.11, -0.26, 0.1, 0.02),
                       (0.11, -0.26, 0.1, 0.02), (-0.03, -0.27, 0.13, 0.018), (0.03, -0.27, 0.13, 0.018)]:
        eyes.append(sphere(r, (x, y, z), seg=8, rings=6, mat="Eye"))
    join(eyes, "Eyes", smooth=True)
    for i in range(8):
        side = -1 if i < 4 else 1
        k = i % 4
        ang = math.radians((-60, -20, 20, 60)[k])
        length = (1.0, 1.1, 1.05, 1.15)[k]
        pts = [V((0, 0, 0)), V((0.35 * length, 0, 0.32)), V((0.62 * length, 0, 0.28)), V((0.95 * length, 0, -0.3))]
        leg = curve_limb(pts, 0.05, 0.008, 6, "Chitin")
        leg.append(sphere(0.06, pts[1], seg=6, rings=4, mat="Chitin"))
        for _ in range(8):
            j = random.randrange(3)
            base = pts[j].lerp(pts[j + 1], random.random())
            d = V((random.uniform(-0.5, 0.5), random.uniform(-1, 1), random.uniform(-0.2, 1))).normalized()
            leg.append(limb(base, base + d * 0.07, 0.008, 0.001, 3, "Chitin"))
        o = join(leg, f"Leg{i}")
        scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        o.rotation_mode = "XYZ"  # после join остаётся кватернион от первой части
        o.rotation_euler = (0, 0, (0 if side > 0 else math.pi) + side * ang)
        o.location = (side * 0.12, -0.12 + (k - 1.5) * 0.06, 0.02)
    export("spider")


def deer():
    """Олень — фоновый житель леса."""
    reset()
    random.seed(3)
    p = [box((0.22, 0.5, 0.22), (0, 0, 0.52), mat="Fur", bev=0.04),
         box((0.2, 0.16, 0.24), (0, -0.2, 0.55), mat="Fur", bev=0.04)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box((0.055, 0.06, 0.36), (sx * 0.07, sy * 0.19, 0.24), mat="Fur"))
            p.append(box((0.06, 0.07, 0.06), (sx * 0.07, sy * 0.19 - 0.005, 0.03), mat="Boots"))
    p.append(box((0.1, 0.1, 0.26), (0, -0.3, 0.7), (-0.45, 0, 0), mat="Fur"))                  # шея
    p.append(box((0.11, 0.21, 0.11), (0, -0.4, 0.84), mat="Fur", bev=0.03))                    # голова
    p.append(box((0.07, 0.05, 0.05), (0, -0.51, 0.83), mat="Shadow"))                           # нос
    for s in (-1, 1):
        p.append(box((0.03, 0.07, 0.04), (s * 0.08, -0.34, 0.9), (0, 0, s * 0.3), mat="Fur"))  # уши
        p.append(sphere(0.015, (s * 0.056, -0.46, 0.86), seg=6, rings=4, mat="Shadow"))
        base = V((s * 0.035, -0.36, 0.9))
        p += curve_limb([base, base + V((s * 0.06, 0.02, 0.12)), base + V((s * 0.12, 0.06, 0.22))], 0.015, 0.008, 5, "Antler")
        p.append(limb(base + V((s * 0.06, 0.02, 0.12)), base + V((s * 0.04, -0.06, 0.2)), 0.01, 0.005, 4, "Antler"))
        p.append(limb(base + V((s * 0.1, 0.05, 0.19)), base + V((s * 0.17, 0.03, 0.26)), 0.009, 0.004, 4, "Antler"))
    p.append(box((0.06, 0.04, 0.06), (0, 0.26, 0.6), mat="Bone"))                               # хвост
    join(p, "Deer")
    export("deer")


# =============================================================================
# Растительность и камни
# =============================================================================

def grow_tree(seed, height, spread, depth_max, trunk_r, moss=0.0, droop=0.0, verts=7):
    """moss — вероятность свисающего мха в узлах веток, droop — насколько ветки клонятся вниз."""
    random.seed(seed)
    parts = []

    def branch(p0, direction, length, radius, depth):
        pts = [V(p0)]
        d = direction.normalized()
        for _ in range(3):
            d = (d + V((random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), random.uniform(-0.1, 0.15)))).normalized()
            pts.append(pts[-1] + d * (length / 3))
        parts.extend(curve_limb(pts, radius, radius * 0.55, 5 if depth else verts, "Bark"))
        for q in pts[1:]:
            if random.random() < moss:
                ln = random.uniform(0.25, 0.7)
                sway = V((random.uniform(-0.06, 0.06), random.uniform(-0.06, 0.06), 0))
                parts.extend(curve_limb([q, q + sway - V((0, 0, ln * 0.5)), q + sway * 2 - V((0, 0, ln))], 0.022, 0.006, 4, "Moss"))
        tip, r = pts[-1], radius * 0.55
        if depth >= depth_max or r < 0.012:
            parts.append(limb(tip, tip + d * length * 0.35, r, 0.002, 4, "Bark"))
            return
        kids = 3 if depth == 0 else random.choice((2, 2, 3))
        for i in range(kids):
            a = i / kids * math.tau + random.uniform(-0.5, 0.5)
            side = V((math.cos(a), math.sin(a), 0))
            nd = d * 0.55 + side * random.uniform(0.7, 1.2) * spread + V((0, 0, random.uniform(-0.1, 0.35) - droop))
            src = pts[random.choice((2, 3))] if depth else tip
            branch(src, nd, length * random.uniform(0.55, 0.72), r * random.uniform(0.75, 0.95), depth + 1)

    pts, d = [V((0, 0, -0.05))], V((0, 0, 1))
    for _ in range(4):
        d = (d + V((random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0))).normalized()
        pts.append(pts[-1] + d * (height * 0.55 / 4))
    parts.extend(curve_limb(pts, trunk_r, trunk_r * 0.62, verts + 2, "Bark"))
    jitter(parts[0], trunk_r * 0.12, 8, seed)
    for i in range(5):  # корни
        a = i / 5 * math.tau + random.uniform(-0.3, 0.3)
        out = V((math.cos(a), math.sin(a), 0))
        parts.extend(curve_limb([V((0, 0, 0.14)) + out * 0.04, out * trunk_r * 1.2 + V((0, 0, 0.03)),
                                 out * trunk_r * 1.9 + V((0, 0, -0.04))], trunk_r * 0.45, 0.02, 5, "Bark"))
    k = pts[2]
    parts.append(limb(k, k + V((random.uniform(-1, 1), random.uniform(-1, 1), 0.3)).normalized() * 0.18, trunk_r * 0.35, 0.01, 5, "Bark"))
    branch(pts[-1], d + V((0, 0, 0.3)), height * 0.5, trunk_r * 0.62, 0)
    return parts


def tree():
    reset()
    join(grow_tree(7, 1.7, 1.0, 3, 0.15), "Tree")
    export("tree")


def tree_tall():
    reset()
    join(grow_tree(21, 3.2, 0.8, 4, 0.2), "TreeTall")
    export("tree_tall")


def frame_tree():
    reset()
    join(grow_tree(55, 5.5, 0.9, 3, 0.45, droop=0.15, verts=8), "FrameTree")
    export("frame_tree")


def swamp_tree():
    """Кривое дерево-арка: толстый ствол изогнут дугой, сверху мох, снизу свисают пряди."""
    reset()
    random.seed(33)
    arc = [V((-0.45, 0, 0)), V((-0.42, 0.02, 0.45)), V((-0.2, 0, 0.85)), V((0.2, 0.02, 0.98)), V((0.55, 0, 0.8)), V((0.75, 0, 0.45))]
    p = curve_limb(arc, 0.22, 0.09, 9, "Bark")
    jitter(p[0], 0.03, 6, 1)
    for i in range(4):  # корни у основания
        a = i / 4 * math.tau + 0.4
        out = V((math.cos(a), math.sin(a), 0))
        p += curve_limb([arc[0] + V((0, 0, 0.12)), arc[0] + out * 0.25 + V((0, 0, 0.02)), arc[0] + out * 0.4 + V((0, 0, -0.04))], 0.08, 0.02, 5, "Bark")
    for j in range(1, len(arc) - 1):  # подушки мха сверху
        for _ in range(2):
            q = arc[j].lerp(arc[j + 1], random.random()) + V((0, random.uniform(-0.05, 0.05), 0.1))
            p.append(sphere(random.uniform(0.09, 0.14), q, (1.3, 1.1, 0.5), 8, 5, "Moss"))
    for _ in range(12):  # свисающие пряди мха
        j = random.randint(1, len(arc) - 2)
        q = arc[j].lerp(arc[j + 1], random.random()) - V((0, 0, 0.12))
        ln = random.uniform(0.2, 0.55)
        p += curve_limb([q, q + V((0.02, 0, -ln * 0.5)), q + V((0.03, 0.01, -ln))], 0.03, 0.008, 4, "Moss")
    for _ in range(5):  # трава у корней
        x, y = random.uniform(-0.7, -0.2), random.uniform(-0.25, 0.25)
        p.append(limb((x, y, 0), (x + random.uniform(-0.05, 0.05), y, random.uniform(0.12, 0.22)), 0.02, 0.002, 3, "Grass"))
    join(p, "SwampTree")
    export("swamp_tree")


def stump():
    reset()
    random.seed(4)
    o = cyl(0.2, 0.4, (0, 0, 0.2), verts=10, mat="Bark")
    for v in o.data.vertices:
        if v.co.z > 0:
            v.co.z += random.uniform(-0.08, 0.06)
    jitter(o, 0.02, 7, 4)
    p = [o, cyl(0.16, 0.02, (0, 0, 0.37), verts=10, mat="Wood")]                  # срез
    p.append(sphere(0.12, (-0.08, 0.06, 0.33), (1.4, 1.2, 0.45), 8, 5, "Moss"))  # мох на срезе
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        out = V((math.cos(a), math.sin(a), 0))
        p += curve_limb([out * 0.15 + V((0, 0, 0.12)), out * 0.3 + V((0, 0, 0.03)), out * 0.42 + V((0, 0, -0.04))], 0.07, 0.01, 5, "Bark")
    p.append(cyl(0.012, 0.07, (0.22, -0.1, 0.035), verts=6, mat="Stem"))          # грибок у корня
    p.append(sphere(0.035, (0.22, -0.1, 0.075), (1, 1, 0.55), 8, 5, "CapRed"))
    join(p, "Stump")
    export("stump")


def bush():
    reset()
    random.seed(9)
    parts = []
    for i in range(14):
        a = random.uniform(0, math.tau)
        tilt = random.uniform(0.35, 1.1)
        d = V((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        pts = [V((0, 0, 0))]
        for _ in range(3):
            d = (d + V((random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), random.uniform(-0.2, 0.1)))).normalized()
            pts.append(pts[-1] + d * random.uniform(0.1, 0.16))
        parts.extend(curve_limb(pts, 0.025, 0.004, 4, "Bark"))
        for j in (1, 2):
            base = pts[j]
            parts.append(limb(base, base + V((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(0, 1))).normalized() * 0.06, 0.01, 0.001, 3, "Bark"))
    join(parts, "Bush")
    export("bush")


def grass():
    reset()
    random.seed(13)
    parts = []
    for i in range(9):
        a = random.uniform(0, math.tau)
        r = random.uniform(0, 0.08)
        base = V((math.cos(a) * r, math.sin(a) * r, 0))
        lean = V((math.cos(a), math.sin(a), 0)) * random.uniform(0.05, 0.14)
        h = random.uniform(0.14, 0.3)
        mid = base + lean * 0.4 + V((0, 0, h * 0.55))
        tip = base + lean + V((0, 0, h))
        m = "Grass" if i % 3 else "Reed"
        parts.append(limb(base, mid, 0.018, 0.012, 3, m))
        parts.append(limb(mid, tip, 0.012, 0.001, 3, m))
    join(parts, "Grass")
    export("grass")


def reeds():
    reset()
    random.seed(17)
    parts = []
    for i in range(7):
        base = V((random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), -0.3))
        h = random.uniform(0.7, 1.1)
        lean = V((random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), 0))
        tip = base + lean + V((0, 0, h))
        parts.append(limb(base, tip, 0.016, 0.009, 4, "Reed"))
        if i % 2 == 0:  # рогоз
            parts.append(limb(tip - V((0, 0, 0.02)), tip + V((0, 0, 0.16)), 0.032, 0.03, 6, "WoodDark"))
            parts.append(limb(tip + V((0, 0, 0.16)), tip + V((0, 0, 0.26)), 0.006, 0.001, 3, "Reed"))
        else:
            mid = base + V((0, 0, h * 0.4))
            parts.append(limb(mid, mid + lean * 2 + V((0.15, 0, 0.35)), 0.022, 0.001, 3, "Grass"))
    join(parts, "Reeds")
    export("reeds")


def rock():
    """Кучка угловатых камней."""
    reset()
    random.seed(3)
    p = []
    for (x, y, sx, sy, sz), m in zip([(0, 0, 0.36, 0.3, 0.26), (0.22, -0.14, 0.2, 0.18, 0.16), (-0.2, 0.12, 0.18, 0.2, 0.14), (0.05, 0.2, 0.14, 0.12, 0.1)],
                                     ("Stone", "StoneDark", "Stone", "StoneDark")):
        p.append(box((sx, sy, sz), (x, y, sz / 2 - 0.01), (random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), random.uniform(0, 3)), mat=m, bev=0.03))
    join(p, "Rock")
    export("rock")


def mushroom():
    reset()
    random.seed(12)
    parts = []
    for x, y, h, r in [(0, 0, 0.45, 0.2), (0.19, 0.1, 0.28, 0.12), (-0.16, 0.13, 0.22, 0.1), (0.06, -0.2, 0.17, 0.08), (-0.2, -0.12, 0.12, 0.06)]:
        top = V((x * 1.15, y * 1.15, h))
        parts += curve_limb([(x, y, 0), (x * 1.05, y * 1.05, h * 0.5), top], r * 0.35, r * 0.28, 8, "Stem")
        cap = sphere(r, top, (1, 1, 0.55), 12, 7, "CapRed")
        jitter(cap, r * 0.06, 8, int(h * 100))
        parts.append(cap)
        for k in range(3):  # белые пятна
            a = random.uniform(0, math.tau)
            parts.append(sphere(r * 0.13, top + V((math.cos(a) * r * 0.55, math.sin(a) * r * 0.55, r * 0.42)), (1, 1, 0.4), 6, 4, "Bone"))
    join(parts, "Mushroom", smooth=True)
    export("mushroom")


def skull():
    reset()
    p = [box((0.16, 0.18, 0.14), (0, 0, 0.08), mat="Bone", bev=0.04), box((0.12, 0.06, 0.06), (0, -0.09, 0.03), mat="Bone")]
    for s in (-1, 1):
        p.append(box((0.045, 0.02, 0.04), (s * 0.04, -0.09, 0.1), mat="Shadow"))
    p.append(box((0.03, 0.02, 0.03), (0, -0.095, 0.06), mat="Shadow"))
    for a, x in ((0.4, 0.2), (-0.7, -0.18), (1.9, 0.08)):  # кости рядом
        p.append(limb((x, 0.12, 0.02), (x + math.cos(a) * 0.2, 0.12 + math.sin(a) * 0.2, 0.02), 0.018, 0.018, 5, "Bone"))
    join(p, "Skull")
    export("skull")


def signpost():
    reset()
    p = [box((0.08, 0.08, 0.8), (0, 0, 0.4), mat="WoodDark"),
         box((0.42, 0.04, 0.14), (0.14, -0.05, 0.62), (0, 0.08, 0), mat="Wood"),
         box((0.12, 0.04, 0.1), (0.38, -0.05, 0.64), (0, 0.8, 0), mat="Wood"),   # остриё стрелки
         box((0.36, 0.04, 0.12), (-0.1, -0.05, 0.44), (0, -0.1, 0), mat="Wood")]
    for x in (0.02, -0.02):
        p.append(cyl(0.012, 0.02, (x, -0.075, 0.62 - abs(x) * 9), (math.pi / 2, 0, 0), 6, "Steel"))
    join(p, "Signpost")
    export("signpost")


# =============================================================================
# Опасности, мосты и плавучее
# =============================================================================

def saw():
    reset()
    bm = bmesh.new()
    teeth, r_tip, r_gul = 22, 0.52, 0.43
    outline = []
    for i in range(teeth):
        a0 = i / teeth * math.tau
        a1 = (i + 0.72) / teeth * math.tau
        outline.append(bm.verts.new((math.cos(a0) * r_gul, 0, math.sin(a0) * r_gul)))
        outline.append(bm.verts.new((math.cos(a1) * r_tip, 0, math.sin(a1) * r_tip)))
    face = bm.faces.new(outline)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0.035, 0))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, -0.0175, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("SawDisc")
    bm.to_mesh(me)
    disc = bpy.data.objects.new("SawDisc", me)
    bpy.context.collection.objects.link(disc)
    parts = [M(disc, "Steel")]
    for s in (-1, 1):
        parts.append(cyl(0.13, 0.03, (0, s * 0.03, 0), (math.pi / 2, 0, 0), 14, "Rust"))
        parts.append(torus(0.3, 0.012, (0, s * 0.02, 0), (math.pi / 2, 0, 0), 28, mat="SteelDark"))
        for i in range(5):
            a = i / 5 * math.tau
            parts.append(cyl(0.022, 0.03, (math.cos(a) * 0.08, s * 0.045, math.sin(a) * 0.08), (math.pi / 2, 0, 0), 6, "SteelDark"))
    join(parts, "Saw")
    export("saw")


def thornball():
    reset()
    random.seed(19)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.3)
    core = M(active(), "SteelDark")
    parts = [core]
    for i in range(22):  # крупные шипы
        d = V((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))).normalized()
        parts.append(limb(d * 0.24, d * 0.52, 0.07, 0.004, 5, "Steel"))
    parts.append(cyl(0.1, 0.66, (0, 0, 0), (math.pi / 2, 0, 0), 8, "Rust"))  # ось
    join(parts, "Thornball")
    export("thornball")


def gear():
    reset()
    parts = [cog(0.4, 12, 0.09, 0.12, "Rust")]
    for s in (-1, 1):
        parts.append(torus(0.3, 0.025, (0, s * 0.05, 0), (math.pi / 2, 0, 0), 24, mat="SteelDark"))
        parts.append(cyl(0.11, 0.06, (0, s * 0.055, 0), (math.pi / 2, 0, 0), 12, "Steel"))
    for i in range(3):
        parts.append(box((0.62, 0.1, 0.06), (0, 0, 0), (0, i / 3 * math.pi, 0), mat="SteelDark"))
    join(parts, "Gear")
    export("gear")


def cart():
    reset()
    parts = [box((1.0, 0.56, 0.05), (0, 0, 0.24), mat="SteelDark")]
    for s in (-1, 1):
        parts.append(box((1.06, 0.05, 0.36), (0, s * 0.3, 0.42), (s * 0.12, 0, 0), mat="WoodDark"))
        parts.append(box((0.05, 0.62, 0.36), (s * 0.52, 0, 0.42), (0, -s * 0.12, 0), mat="WoodDark"))
        parts.append(box((1.1, 0.06, 0.05), (0, s * 0.33, 0.6), mat="Rust"))
        for x in (-0.33, 0.33):
            parts.append(cyl(0.13, 0.05, (x, s * 0.3, 0.13), (math.pi / 2, 0, 0), 14, "SteelDark"))
            parts.append(cyl(0.04, 0.07, (x, s * 0.3, 0.13), (math.pi / 2, 0, 0), 8, "Rust"))
    random.seed(5)
    for i in range(7):  # уголь
        parts.append(sphere(random.uniform(0.1, 0.16), (random.uniform(-0.35, 0.35), random.uniform(-0.15, 0.15), 0.52), seg=6, rings=4, mat="Coal"))
    join(parts, "Cart")
    export("cart")


def make_log(length, seed):
    reset()
    random.seed(seed)
    o = cyl(0.27, length, (0, 0, 0), (0, math.pi / 2, 0), 12, "Bark")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.01]
    bmesh.ops.subdivide_edges(bm, edges=side, cuts=int(length * 4), use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    for v in o.data.vertices:  # кора
        ang = math.atan2(v.co.y, v.co.x)
        r = math.hypot(v.co.x, v.co.y)
        if r > 0.2:
            groove = 0.95 if math.sin(ang * 9 + v.co.z * 1.5) > 0.6 else 1.0
            k = groove * (1 + noise.noise(V((v.co.z * 2, ang, seed))) * 0.07)
            v.co.x *= k
            v.co.y *= k
    parts = [o]
    for s in (-1, 1):  # светлые срезы на торцах
        parts.append(cyl(0.24, 0.02, (s * length / 2, 0, 0), (0, math.pi / 2, 0), 12, "Wood"))
        parts.append(torus(0.13, 0.012, (s * (length / 2 + 0.012), 0, 0), (0, math.pi / 2, 0), 14, mat="WoodDark"))
    for i in range(int(length) + 1):  # сучья
        x = random.uniform(-length / 2 + 0.3, length / 2 - 0.3)
        a = random.uniform(0.3, math.pi - 0.3) * random.choice((1, -1))
        base = V((x, math.cos(a) * 0.22, abs(math.sin(a)) * 0.22))
        out = V((random.uniform(-0.3, 0.3), math.cos(a), abs(math.sin(a)))).normalized()
        parts.append(limb(base, base + out * random.uniform(0.12, 0.25), 0.05, 0.02, 5, "Bark"))
    if random.random() < 0.8:
        parts.append(sphere(0.12, (random.uniform(-0.4, 0.4), 0, 0.24), (1.6, 1.1, 0.4), 8, 5, "Moss"))
    join(parts, "Log")
    export(f"log{length}")


def lily():
    """Одиночная кувшинка: круглый лист с вырезом и светящийся белый цветок; верх в z = 0."""
    reset()
    random.seed(3)
    pad = cyl(0.42, 0.04, (0, 0, -0.02), (0, 0, 0.4), 20, "Leaf")
    for v in pad.data.vertices:  # вырез у листа
        a = math.atan2(v.co.y, v.co.x)
        if abs(a) < 0.22:
            v.co.x *= 0.25
            v.co.y *= 0.25
        else:  # лёгкая волна по краю
            v.co.z += math.sin(a * 5) * 0.006
    ribs = [limb((0, 0, 0.002), (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.002), 0.008, 0.004, 3, "Moss")
            for a in [i / 7 * math.tau + 0.45 for i in range(7)]]
    join([pad] + ribs, "Lily")
    fx, fy = -0.08, 0.06
    petals = []
    for ring, (n, rad, h, w) in enumerate(((8, 0.1, 0.07, 0.03), (6, 0.06, 0.1, 0.024))):
        for i in range(n):
            a = i / n * math.tau + ring * 0.3
            petals.append(limb((fx, fy, 0.01), (fx + math.cos(a) * rad, fy + math.sin(a) * rad, h), w, 0.004, 4, "Eye"))
    petals.append(sphere(0.022, (fx, fy, 0.05), seg=8, rings=5, mat="Eye"))
    join(petals, "Flower")
    export("lily")


def plank():
    """Доска моста: настил из досок на поперечинах."""
    reset()
    random.seed(31)
    p = []
    for i, x in enumerate((-0.33, -0.11, 0.11, 0.33)):
        p.append(box((0.2, 0.88 + random.uniform(-0.05, 0.02), 0.07), (x, random.uniform(-0.02, 0.02), -0.035),
                     (0, 0, random.uniform(-0.04, 0.04)), mat="Wood"))
        for y in (-0.36, 0.36):
            p.append(cyl(0.014, 0.02, (x, y, 0.005), verts=6, mat="Steel"))
    for y in (-0.3, 0.3):
        p.append(box((0.92, 0.09, 0.06), (0, y, -0.1), mat="WoodDark"))
    join(p, "Plank")
    export("plank")


def plank_swamp():
    reset()
    random.seed(37)
    p = []
    for i, x in enumerate((-0.32, -0.1, 0.12, 0.33)):
        ln = random.uniform(0.62, 0.88)
        p.append(box((0.19, ln, 0.06), (x, random.uniform(-0.08, 0.08), -0.03), (0, random.uniform(-0.06, 0.06), random.uniform(-0.1, 0.1)), mat="Wood"))
    for y in (-0.28, 0.28):  # верёвочная обвязка (локальная Y после поворота — высота)
        p.append(torus(1, 0.014, (0, y, -0.03), (math.pi / 2, 0, 0), 24, (0.46, 0.07, 1), mat="Rope"))
    join(p, "PlankSwamp")
    export("plank_swamp")


def grate():
    reset()
    p = [box((0.9, 0.07, 0.08), (0, s * 0.42, -0.04), mat="SteelDark") for s in (-1, 1)]
    p += [box((0.07, 0.9, 0.08), (s * 0.42, 0, -0.04), mat="SteelDark") for s in (-1, 1)]
    for i in range(6):
        p.append(box((0.035, 0.84, 0.05), (-0.3 + i * 0.12, 0, -0.03), mat="Rust"))
    for y in (-0.2, 0.2):
        p.append(box((0.84, 0.035, 0.045), (0, y, -0.05), mat="Rust"))
    for a in (-1, 1):
        for b in (-1, 1):
            p.append(cyl(0.025, 0.02, (a * 0.42, b * 0.42, 0.005), verts=6, mat="Steel"))
    join(p, "Grate")
    export("grate")


def slab():
    """Бетонная плита-мост из четырёх плиток с арматурой по краям."""
    reset()
    random.seed(13)
    p = []
    for a in (-1, 1):
        for b in (-1, 1):
            p.append(box((0.43, 0.42, 0.14), (a * 0.225, b * 0.22, -0.07 + random.uniform(-0.015, 0.0)), (0, 0, random.uniform(-0.03, 0.03)),
                         mat="Stone" if (a + b) else "StoneDark", bev=0.02))
    for i in range(3):
        y = random.uniform(-0.35, 0.35)
        s = random.choice((-1, 1))
        p += curve_limb([(s * 0.44, y, -0.06), (s * 0.55, y, -0.05), (s * 0.6, y + 0.05, -0.15)], 0.012, 0.01, 4, "Rust")
    join(p, "Slab")
    export("slab")


def post():
    """Столбик мостков с провисающей цепью в сторону +X."""
    reset()
    p = [box((0.14, 0.14, 0.62), (0, 0, 0.16), mat="WoodDark"), box((0.18, 0.18, 0.05), (0, 0, 0.48), mat="Wood")]
    for i in range(9):
        t = (i + 0.5) / 9
        z = 0.4 - math.sin(t * math.pi) * 0.14
        p.append(torus(0.035, 0.009, (t, 0, z), (0, math.pi / 2, (i % 2) * math.pi / 2), 8, (1.5, 1, 1), "SteelDark"))
    join(p, "Post")
    export("post")


def raft(length, seed):
    """Плот из ящиков; верх в z = 0."""
    reset()
    random.seed(seed)
    parts = []
    for k in range(length):
        x = -length / 2 + 0.5 + k
        sz = random.uniform(0.66, 0.78)
        parts.append(box((sz, sz, sz), (x, random.uniform(-0.05, 0.05), -sz / 2), (0, 0, random.uniform(-0.1, 0.1)), mat="Wood", bev=0.02))
        parts.append(box((sz + 0.04, 0.06, 0.05), (x, 0, 0), mat="SteelDark"))
        parts.append(box((0.06, sz + 0.04, 0.05), (x, 0, 0), mat="SteelDark"))
    for k in range(length - 1):
        parts.append(torus(0.12, 0.016, (-length / 2 + 1 + k, 0, -0.1), (0, math.pi / 2, 0), 12, mat="Rope"))
    join(parts, "Raft")
    export(f"raft{length}")


def door(length, seed):
    """Плавучая дверь (+ доска для длины 3); верх примерно в z = 0.05."""
    reset()
    random.seed(seed)
    x0 = -length / 2 + 0.8
    parts = [box((1.5, 0.68, 0.08), (x0, 0, 0), mat="Wood")]
    for dx in (-0.35, 0.35):
        parts.append(box((0.55, 0.22, 0.03), (x0 + dx, -0.16, 0.05), mat="WoodDark"))
        parts.append(box((0.55, 0.22, 0.03), (x0 + dx, 0.16, 0.05), mat="WoodDark"))
    for dx in (-0.55, 0.45):  # петли
        parts.append(box((0.12, 0.05, 0.03), (x0 + dx, -0.33, 0.045), mat="SteelDark"))
    parts.append(sphere(0.035, (x0 + 0.6, 0.25, 0.07), seg=6, rings=4, mat="Steel"))
    if length > 2:
        ln = length - 1.7
        parts.append(box((ln, 0.3, 0.07), (length / 2 - ln / 2, random.uniform(-0.1, 0.1), 0), (0, 0, random.uniform(-0.1, 0.1)), mat="Wood"))
    join(parts, "Door")
    export(f"door{length}")


# --- Снаряды охотников --------------------------------------------------------

def spear():
    reset()
    p = [limb((-0.6, 0, 0), (0.45, 0, 0), 0.02, 0.018, 6, "Wood"), limb((0.45, 0, 0), (0.66, 0, 0), 0.045, 0.002, 4, "Steel"),
         torus(0.022, 0.009, (0.44, 0, 0), (0, math.pi / 2, 0), 8, mat="LeatherDark")]
    for k in (-0.55, -0.48):
        p.append(limb((k, 0, 0), (k - 0.1, 0.06, 0.03), 0.012, 0.002, 3, "Bone"))
    join(p, "Spear")
    export("spear")


def dart():
    reset()
    p = [limb((-0.18, 0, 0), (0.12, 0, 0), 0.009, 0.009, 5, "Reed"), limb((0.12, 0, 0), (0.2, 0, 0), 0.013, 0.001, 4, "Steel"),
         limb((-0.2, 0, 0), (-0.12, 0, 0), 0.045, 0.006, 6, "Bone")]
    join(p, "Dart")
    export("dart")


def bolt():
    reset()
    p = [limb((-0.25, 0, 0), (0.2, 0, 0), 0.015, 0.015, 5, "WoodDark"), limb((0.2, 0, 0), (0.31, 0, 0), 0.032, 0.002, 4, "Steel")]
    for a in (0, math.pi / 2):
        p.append(box((0.12, 0.006, 0.06), (-0.2, 0, 0), (a, 0, 0), mat="Leather", bev=0))
    join(p, "Bolt")
    export("bolt")


def stone():
    reset()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.09)
    o = M(active(), "Stone")
    jitter(o, 0.02, 6, 2)
    join([o], "Stone")
    export("stone")


# =============================================================================
# Лесопилка
# =============================================================================

def crate_parts(center=(0, 0, 0), size=0.72, rot=0.0):
    c = V(center)
    s, t = size / 2, 0.06
    parts = [box((size - 0.06, size - 0.06, size - 0.06), c + V((0, 0, s)), (0, 0, rot), mat="Wood")]
    for a in (-1, 1):
        for b in (-1, 1):
            parts.append(box((t, t, size), c + V((a * s, b * s, s)), mat="WoodDark"))
            parts.append(box((size, t, t), c + V((0, a * s, s + b * s)), mat="WoodDark"))
            parts.append(box((t, size, t), c + V((a * s, 0, s + b * s)), mat="WoodDark"))
    for a in (-1, 1):
        parts.append(box((size * 1.25, 0.04, 0.06), c + V((0, a * (s - 0.015), s)), (0, math.pi / 4 * a, 0), mat="WoodDark"))
    return parts


def crate():
    reset()
    join(crate_parts(), "Crate")
    export("crate")


def crate_pile():
    reset()
    p = crate_parts((-0.22, 0, 0), 0.6) + crate_parts((0.3, 0.05, 0), 0.5) + crate_parts((-0.1, 0.02, 0.6), 0.5)
    join(p, "CratePile")
    export("crate_pile")


def plank_pile():
    reset()
    random.seed(44)
    p = []
    for layer in range(3):
        for k in range(3 - layer):
            p.append(box((1.0, 0.16, 0.06), (random.uniform(-0.05, 0.05), -0.18 + k * 0.18 + layer * 0.09, 0.03 + layer * 0.065),
                         (0, 0, random.uniform(-0.12, 0.12)), mat="Wood" if (k + layer) % 2 else "WoodDark"))
    join(p, "PlankPile")
    export("plank_pile")


def barrel():
    reset()
    o = cyl(0.3, 0.76, (0, 0, 0.38), verts=14, mat="Wood")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.01]
    bmesh.ops.subdivide_edges(bm, edges=side, cuts=5, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    for v in o.data.vertices:  # пузатость (локальные координаты: центр в нуле)
        k = 1 + 0.13 * (1 - (v.co.z / 0.38) ** 2)
        v.co.x *= k
        v.co.y *= k
    parts = [o, cyl(0.28, 0.02, (0, 0, 0.765), verts=14, mat="WoodDark")]
    for z in (0.08, 0.26, 0.5, 0.68):
        rr = 0.3 * (1 + 0.13 * (1 - ((z - 0.38) / 0.38) ** 2)) + 0.012
        parts.append(torus(rr, 0.02, (0, 0, z), seg=20, mat="SteelDark"))
    join(parts, "Barrel")
    export("barrel")


def gearpost():
    reset()
    p = [box((0.5, 0.4, 0.08), (0, 0, 0.04), mat="StoneDark"), box((0.13, 0.13, 0.9), (0, 0.08, 0.48), mat="WoodDark"),
         box((0.3, 0.1, 0.1), (0.1, 0.08, 0.86), mat="WoodDark")]
    g = cog(0.26, 10, 0.07, 0.08, "Rust")
    g.location = (0, -0.03, 0.78)
    p.append(g)
    g2 = cog(0.14, 8, 0.07, 0.06, "Rust")
    g2.location = (0.34, -0.03, 0.86)
    p.append(g2)
    p.append(cyl(0.06, 0.16, (0, 0, 0.78), (math.pi / 2, 0, 0), 10, "Steel"))
    join(p, "GearPost")
    export("gearpost")


def pipe():
    reset()
    p = [cyl(0.2, 1.4, (0, 0, 0.2), (0, math.pi / 2, 0), 14, "SteelDark"),
         cyl(0.12, 0.05, (0.72, 0, 0.2), (0, math.pi / 2, 0), 14, "Shadow")]
    for x in (-0.66, 0.0, 0.66):
        p.append(cyl(0.23, 0.08, (x, 0, 0.2), (0, math.pi / 2, 0), 14, "Steel"))
    p.append(sphere(0.1, (-0.2, 0.05, 0.02), (1.8, 1.2, 0.3), 8, 5, "Rust"))  # ржавая лужа
    join(p, "Pipe")
    export("pipe")


def chimney():
    reset()
    random.seed(8)
    parts = [box((0.8, 0.8, 3.2), (0, 0, 1.6), mat="Brick"), box((1.0, 1.0, 0.18), (0, 0, 3.25), mat="StoneDark"),
             box((1.0, 1.0, 0.3), (0, 0, 0.15), mat="StoneDark")]
    for i in range(18):
        z = random.uniform(0.4, 3.0)
        side = random.choice(((0.41, 0), (-0.41, 0), (0, 0.41), (0, -0.41)))
        parts.append(box((0.2, 0.2, 0.1), (side[0], side[1], z), mat="Brick"))
    parts += curve_limb([(0.4, 0, 1.2), (0.8, 0, 1.2), (0.9, 0, 0.6), (0.9, 0, 0)], 0.07, 0.07, 8, "Rust")
    join(parts, "Chimney")
    export("chimney")


def scrap():
    """Куча железного хлама: кубики ржавчины и металла."""
    reset()
    random.seed(15)
    p = []
    for i in range(9):
        x, y = random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3)
        s = random.uniform(0.08, 0.18)
        h = max(0.0, 0.18 - math.hypot(x, y) * 0.4)
        p.append(box((s, s * random.uniform(0.7, 1.2), s), (x, y, h + s / 2), (random.uniform(-0.3, 0.3), 0, random.uniform(0, 3)),
                     mat=random.choice(("Rust", "SteelDark", "StoneDark")), bev=0.015))
    p.append(cyl(0.02, 0.4, (0.1, -0.05, 0.1), (0.4, 1.2, 0), 6, "Steel"))
    join(p, "Scrap")
    export("scrap")


# =============================================================================
# Руины
# =============================================================================

def pillar():
    reset()
    random.seed(21)
    parts = [box((0.66, 0.66, 0.18), (0, 0, 0.09), mat="StoneDark")]
    z = 0.18
    levels = random.randint(5, 6)
    for i in range(levels):
        h = random.uniform(0.2, 0.26)
        w = 0.44 - (0.05 if i % 2 else 0)
        if i == levels - 1:
            for dx, dy in ((-0.1, -0.1), (0.1, 0.08), (-0.08, 0.12)):
                parts.append(box((0.2, 0.2, h * random.uniform(0.5, 1.0)), (dx, dy, z + h / 2), (0, 0, random.uniform(-0.2, 0.2)), mat="Stone"))
        else:
            parts.append(box((w, w, h - 0.015), (random.uniform(-0.02, 0.02), random.uniform(-0.02, 0.02), z + h / 2),
                             (0, 0, random.uniform(-0.06, 0.06)), mat="Stone" if i % 2 else "StoneDark"))
        z += h
    for i in range(3):
        parts.append(box((0.16, 0.13, 0.11), (random.uniform(-0.45, 0.45), random.choice((-0.42, 0.42)), 0.055), (0.2, 0.3, random.uniform(0, 3)), mat="Stone"))
    join(parts, "Pillar")
    export("pillar")


def lamppost():
    """Деревянный столб-виселица с фонарём (стекло светится)."""
    reset()
    p = [box((0.3, 0.3, 0.14), (0, 0, 0.07), mat="StoneDark"), box((0.1, 0.1, 1.8), (0, 0, 0.95), mat="WoodDark"),
         box((0.5, 0.08, 0.08), (0.2, 0, 1.8), mat="WoodDark"), box((0.06, 0.06, 0.34), (0.1, 0, 1.62), (0, -0.8, 0), mat="WoodDark")]
    p.append(limb((0.4, 0, 1.76), (0.4, 0, 1.66), 0.008, 0.008, 3, "SteelDark"))
    p.append(cone(0.09, 0.03, 0.07, (0.4, 0, 1.64), 8, "SteelDark"))
    p.append(box((0.13, 0.13, 0.03), (0.4, 0, 1.44), mat="SteelDark"))
    for a in range(4):
        ang = a / 4 * math.tau + math.pi / 4
        p.append(limb((0.4 + math.cos(ang) * 0.06, math.sin(ang) * 0.06, 1.61), (0.4 + math.cos(ang) * 0.06, math.sin(ang) * 0.06, 1.45), 0.009, 0.009, 3, "SteelDark"))
    join(p, "Lamppost")
    join([box((0.09, 0.09, 0.14), (0.4, 0, 1.53), mat="Eye", bev=0.01)], "LampEye")
    export("lamppost")


def rubble():
    reset()
    random.seed(27)
    parts = []
    for i in range(10):
        r = random.uniform(0.07, 0.2)
        x, y = random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3)
        h = max(0, 0.25 - math.hypot(x, y) * 0.5)
        parts.append(box((r * 1.5, r, r * 0.9), (x, y, h + r * 0.3), (random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), random.uniform(0, 3)),
                         mat=random.choice(("Stone", "StoneDark")), bev=0.02))
    parts.append(limb((0.05, 0.05, 0.2), (0.35, -0.1, 0.5), 0.012, 0.01, 4, "Rust"))
    join(parts, "Rubble")
    export("rubble")


def ruin_wall():
    """Стена из каменных блоков с аркой и обрушенным краем."""
    reset()
    random.seed(29)
    parts = []
    width = 2.4
    for row in range(10):
        z = 0.14 + row * 0.27
        right = width / 2 - max(0, row - 4) * random.uniform(0.15, 0.4)
        x = -width / 2 + (0.2 if row % 2 else 0)
        while x < right:
            ln = min(0.42, right - x)
            arch = row <= 4 and -0.35 < x + ln / 2 < 0.35
            if row == 5 and -0.45 < x + ln / 2 < 0.45:
                arch = False  # перемычка над аркой
            if ln > 0.12 and not arch:
                parts.append(box((ln - 0.02, 0.32, 0.25), (x + ln / 2, random.uniform(-0.02, 0.02), z),
                                 mat=random.choice(("Stone", "Stone", "StoneDark")), bev=0.02))
            x += 0.42
    join(parts, "RuinWall")
    export("ruin_wall")


# --- Превью -----------------------------------------------------------------

PREVIEW = os.path.join(ROOT, "docs", "models.png")
# имя, подъём над полом (у пил, шестерён и плавучих предметов центр/верх в нуле), масштаб
LINEUP = [
    ("hero", 0, 1.6), ("hunter_forest", 0, 1.1), ("hunter_swamp", 0, 1.1), ("hunter_mill", 0, 1.1), ("hunter_ruins", 0, 1.1),
    ("deer", 0, 1.1), ("spider", 0.4, 1.0), ("spear", 0.4, 0.9), ("dart", 0.4, 2), ("bolt", 0.4, 1.5), ("stone", 0.3, 2),
    ("tree", 0, 0.8), ("tree_tall", 0, 0.5), ("frame_tree", 0, 0.3), ("stump", 0, 1.2), ("bush", 0, 1), ("grass", 0, 1.5),
    ("reeds", 0.3, 1), ("rock", 0, 1.2), ("saw", 0.55, 1), ("log2", 0.3, 0.6), ("log3", 0.3, 0.45), ("plank", 0.1, 1),
    ("swamp_tree", 0, 0.9), ("mushroom", 0, 1.3), ("thornball", 0.55, 1), ("lily", 0.05, 1.2),
    ("plank_swamp", 0.1, 1), ("post", 0, 0.9), ("skull", 0, 1.8), ("signpost", 0, 1.1),
    ("crate", 0, 1), ("crate_pile", 0, 0.9), ("plank_pile", 0, 0.9), ("barrel", 0, 1), ("gearpost", 0, 1), ("gear", 0.55, 1),
    ("raft2", 0.45, 0.6), ("raft3", 0.45, 0.45), ("grate", 0.1, 1), ("pipe", 0, 0.8), ("chimney", 0, 0.4), ("scrap", 0, 1.3),
    ("pillar", 0, 0.9), ("lamppost", 0, 0.7), ("rubble", 0, 1.2), ("ruin_wall", 0, 0.45), ("cart", 0, 0.9),
    ("door2", 0.1, 0.6), ("door3", 0.1, 0.45), ("slab", 0.15, 1),
]
COLS = 12


def render_preview():
    """Импортирует все .glb, расставляет сеткой на полу и рендерит изометрией
    в цветах материалов в docs/models.png."""
    reset()
    scene = bpy.context.scene
    step_x, step_y = 1.6, 2.6
    rows = math.ceil(len(LINEUP) / COLS)
    for idx, (name, lift, scale) in enumerate(LINEUP):
        path = os.path.join(OUT, name + ".glb")
        if not os.path.exists(path):
            continue
        cx, cy = (idx % COLS) * step_x, -(idx // COLS) * step_y
        # сравниваем по именам: ссылки на объекты после оператора импорта могут стать недействительными
        before = {o.name for o in bpy.data.objects}
        bpy.ops.import_scene.gltf(filepath=path)
        # модель — в пустышку, которую разворачиваем на три четверти, как на листе референса
        pivot = bpy.data.objects.new(f"pv_{name}", None)
        bpy.context.collection.objects.link(pivot)
        for o in [o for o in bpy.data.objects if o.name not in before]:
            if o.parent is None and o is not pivot:
                o.parent = pivot
        pivot.location = (cx, cy, lift * scale)
        pivot.scale = (scale, scale, scale)
        pivot.rotation_euler = (0, 0, 0.6)
        bpy.ops.object.text_add(location=(cx, cy - 0.62, 0.01))
        label = active()
        label.data.body = name
        label.data.size = 0.17
        label.data.align_x = "CENTER"
        M(label, "Shadow")

    width = (COLS - 1) * step_x
    depth = (rows - 1) * step_y
    center = V((width / 2, -depth / 2 + 0.4, 0.3))
    bpy.ops.mesh.primitive_plane_add(size=80, location=(width / 2, -depth / 2, -0.002))
    M(active(), "Antler")  # светлый пол, как на листе референса
    view = V((0.0, -1.0, 0.85)).normalized()
    bpy.ops.object.camera_add(location=center + view * 40)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width + 2.4
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_cavity = True
    shading.show_shadows = True
    shading.shadow_intensity = 0.35
    shading.show_object_outline = True
    scene.render.resolution_x = 2400
    scene.render.resolution_y = int(2400 * 0.66)
    world = bpy.data.worlds.new("World")
    world.color = srgb_to_linear("#cfc9bd")
    scene.world = world
    scene.render.filepath = PREVIEW
    os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


BUILDS = [hero, spider, deer, tree, tree_tall, frame_tree, swamp_tree, stump, bush, grass, reeds, rock, mushroom, skull, signpost,
          saw, thornball, gear, cart, plank, plank_swamp, grate, slab, post, spear, dart, bolt, stone,
          crate, crate_pile, plank_pile, barrel, gearpost, pipe, chimney, scrap,
          pillar, lamppost, rubble, ruin_wall,
          lambda: make_log(2, 5), lambda: make_log(3, 6), lily,
          lambda: raft(2, 7), lambda: raft(3, 8), lambda: door(2, 9), lambda: door(3, 10),
          lambda: hunter("forest", "spear"), lambda: hunter("swamp", "blowpipe"),
          lambda: hunter("mill", "crossbow"), lambda: hunter("ruins", "sling")]

for build in BUILDS:
    build()
render_preview()
