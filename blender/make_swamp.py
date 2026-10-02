"""Болотная растительность: поникший куст с бородами мха, переплетённые корни,
гнилой пень со светящимися грибами, заросли камыша.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_swamp.py

Отдельно от make_models.py (тот пересобирает все модели, включая героя).
Листва — те же функции, что в make_veg.py. Результат: models/swamp_bush.glb,
root_tangle.glb, glow_stump.glb, cattail.glb и превью docs/swamp_veg.png.
Материал GlowCap в игре мягко светится бирюзовым.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "make_models.py"), encoding="utf-8").read()
src = src.split("# =============================================================================\n# Персонажи")[0]
exec(compile(src, "make_models_helpers", "exec"))
veg = open(os.path.join(HERE, "make_veg.py"), encoding="utf-8").read()
veg = veg[veg.index("def leaf_mesh("):veg.index("def stems(")]
exec(compile(veg, "make_veg_foliage", "exec"))

PALETTE.update({"LeafLight": "#5b7f45", "GlowCap": "#7fe0d0", "SwampMoss": "#6b7a3a"})
PREVIEW = os.path.join(ROOT, "docs", "swamp_veg.png")


def hanging_moss(parts, top, length, seed):
    """Борода мха: свисающие нити разной длины."""
    random.seed(seed)
    for k in range(5):
        base = V(top) + V((random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), 0))
        ln = length * random.uniform(0.6, 1.0)
        mid = base + V((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), -ln * 0.5))
        parts += curve_limb([base, mid, mid + V((random.uniform(-0.02, 0.02), 0, -ln * 0.5))], 0.018, 0.004, 4, "SwampMoss")


def swamp_bush():
    """Поникший куст: ветви дугой вниз, листва тёмная, с веток свисают бороды мха."""
    reset()
    random.seed(71)
    p = []
    tips = []
    for i in range(6):
        a = i / 6 * math.tau + random.uniform(-0.3, 0.3)
        d = V((math.cos(a), math.sin(a), 0))
        top = d * 0.18 + V((0, 0, 0.55))
        tip = d * 0.42 + V((0, 0, 0.3))
        p += curve_limb([V((0, 0, 0)), d * 0.06 + V((0, 0, 0.35)), top, tip], 0.03, 0.01, 5, "Bark")
        tips.append((top, tip))
    for k, (top, tip) in enumerate(tips):
        foliage(p, top.lerp(tip, 0.4) + V((0, 0, 0.05)), random.uniform(0.15, 0.19), "Leaf", 71 + k, flat=0.55)
        hanging_moss(p, tip, 0.22, 71 + k)
    join(p, "SwampBush")
    export("swamp_bush")


def root_tangle():
    """Переплетённые корни: извилистые узловатые корни разной толщины дугами выходят
    из земли и уходят обратно, перекрещиваясь; мох и грибы у основания."""
    reset()
    random.seed(72)
    p = []
    for k in range(9):
        a = random.uniform(0, math.pi) + k * 0.35
        d = V((math.cos(a), math.sin(a), 0))
        span = random.uniform(0.28, 0.44)
        h = random.uniform(0.18, 0.5)
        off = V((-d.y, d.x, 0)) * random.uniform(-0.15, 0.15)
        pts = []
        for i in range(7):  # извилистая дуга с шумом
            t = i / 6
            base = off + d * (t * 2 - 1) * span
            z = math.sin(t * math.pi) * h - (0.05 if i in (0, 6) else 0)
            wob = V((-d.y, d.x, 0)) * math.sin(t * 7 + k) * 0.04
            pts.append(base + wob + V((0, 0, z + random.uniform(-0.02, 0.02))))
        r0 = random.uniform(0.035, 0.06)
        p += curve_limb(pts, r0, r0 * 0.55, 6, "Bark")
        for i in (2, 4):  # узлы
            if random.random() < 0.6:
                p.append(sphere(r0 * 1.25, pts[i], (1, 1, 0.9), 6, 4, "Bark"))
    p.append(sphere(0.14, (0.05, 0.02, 0.0), (1.8, 1.4, 0.3), 8, 5, "Moss"))
    p.append(sphere(0.08, (0.15, -0.1, 0.3), (1.4, 1.0, 0.35), 8, 5, "SwampMoss"))
    hanging_moss(p, (-0.05, 0.0, 0.42), 0.16, 72)
    for x, y in ((-0.2, 0.15), (0.22, 0.12)):  # грибы у корней
        p += curve_limb([(x, y, 0), (x, y, 0.07)], 0.012, 0.01, 6, "Stem")
        p.append(sphere(0.04, (x, y, 0.08), (1, 1, 0.5), 8, 5, "CapRed"))
    join(p, "RootTangle")
    export("root_tangle")


def glow_stump():
    """Гнилой пень: неровный обломанный верх, мох, гроздья светящихся грибов."""
    reset()
    random.seed(73)
    o = cyl(0.24, 0.42, (0, 0, 0.21), verts=12, mat="Bark")
    for v in o.data.vertices:
        if v.co.z > 0.1:  # рваный обломанный верх
            v.co.z += random.uniform(-0.08, 0.12)
        ang = math.atan2(v.co.y, v.co.x)
        v.co.x *= 1 + 0.08 * math.sin(ang * 5)
        v.co.y *= 1 + 0.08 * math.sin(ang * 5)
    p = [o]
    for k in range(5):  # корни у основания
        a = k / 5 * math.tau + 0.3
        d = V((math.cos(a), math.sin(a), 0))
        p.append(limb(d * 0.15 + V((0, 0, 0.12)), d * 0.38 + V((0, 0, 0.0)), 0.07, 0.03, 6, "Bark"))
    p.append(cyl(0.2, 0.02, (0, 0, 0.36), verts=12, mat="WoodDark"))  # гнилая сердцевина
    p.append(sphere(0.16, (0.1, 0.05, 0.36), (1.4, 1.1, 0.3), 8, 5, "SwampMoss"))
    # светящиеся грибы гроздьями на боку и у корней
    for cx, cy, cz, n in ((0.2, -0.12, 0.2, 4), (-0.22, -0.05, 0.08, 3), (0.05, -0.28, 0.02, 3), (-0.1, 0.2, 0.28, 2)):
        for j in range(n):
            x, y = cx + random.uniform(-0.05, 0.05), cy + random.uniform(-0.05, 0.05)
            z = cz + random.uniform(-0.03, 0.05)
            h = random.uniform(0.04, 0.09)
            p += curve_limb([(x, y, z), (x * 1.08, y * 1.08, z + h)], 0.01, 0.008, 5, "Stem")
            p.append(sphere(random.uniform(0.028, 0.045), (x * 1.1, y * 1.1, z + h), (1, 1, 0.55), 8, 5, "GlowCap"))
    join(p, "GlowStump")
    export("glow_stump")


def cattail():
    """Заросли камыша на суше: густой пучок стеблей и листьев, коричневые початки."""
    reset()
    random.seed(74)
    p = []
    for i in range(16):
        base = V((random.uniform(-0.2, 0.2), random.uniform(-0.2, 0.2), 0))
        h = random.uniform(0.55, 1.05)
        lean = V((random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12), 0))
        tip = base + lean + V((0, 0, h))
        if i % 3 == 0:  # стебель с початком
            p.append(limb(base, tip, 0.014, 0.008, 4, "Reed"))
            p.append(limb(tip - V((0, 0, 0.02)), tip + V((0, 0, 0.15)), 0.03, 0.028, 6, "WoodDark"))
            p.append(limb(tip + V((0, 0, 0.15)), tip + V((0, 0, 0.24)), 0.006, 0.001, 3, "Reed"))
        else:  # узкий лист: вверх и изгиб в сторону
            mid = base + lean * 0.5 + V((0, 0, h * 0.6))
            p.append(limb(base, mid, 0.022, 0.014, 3, "Grass" if i % 2 else "Reed"))
            p.append(limb(mid, mid + lean * 1.8 + V((random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), h * 0.35)), 0.014, 0.001, 3,
                          "Grass" if i % 2 else "Reed"))
    p.append(sphere(0.2, (0, 0, 0.0), (1.3, 1.3, 0.2), 8, 5, "SwampMoss"))
    join(p, "Cattail")
    export("cattail")


def preview(names):
    reset()
    scene = bpy.context.scene
    for idx, name in enumerate(names):
        before = {o.name for o in bpy.data.objects}
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + ".glb"))
        pivot = bpy.data.objects.new(f"pv_{name}", None)
        bpy.context.collection.objects.link(pivot)
        for o in [o for o in bpy.data.objects if o.name not in before]:
            if o.parent is None and o is not pivot:
                o.parent = pivot
        pivot.location = (idx * 1.3, 0, 0)
        pivot.rotation_euler = (0, 0, 0.6)
    width = (len(names) - 1) * 1.3
    bpy.ops.mesh.primitive_plane_add(size=60, location=(width / 2, 0, -0.002))
    M(active(), "Antler")
    view = V((0.0, -1.0, 0.75)).normalized()
    center = V((width / 2, 0, 0.45))
    bpy.ops.object.camera_add(location=center + view * 40)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width + 1.8
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.show_shadows = True
    sh.shadow_intensity = 0.35
    sh.show_object_outline = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 700
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


def mudball():
    """Болотный ком: шар ила и тины, обвитый корнями, мох, стебли камыша, кости.
    Центр в нуле — игра катит его вдоль ряда (как шипастый шар)."""
    reset()
    random.seed(75)
    p = []
    core = sphere(0.38, (0, 0, 0), (1, 1, 1), 14, 10, "Mud")
    jitter(core, 0.05, 4, 75)
    p.append(core)
    for k in range(6):  # налипшие комья
        a, b = random.uniform(0, math.tau), random.uniform(0.3, 2.8)
        n = V((math.cos(a) * math.sin(b), math.sin(a) * math.sin(b), math.cos(b)))
        p.append(sphere(random.uniform(0.1, 0.15), n * 0.33, (1, 1, 0.8), 8, 5, "Mud"))
    for k in range(5):  # корни обвивают ком
        a0 = random.uniform(0, math.tau)
        tilt = random.uniform(-0.6, 0.6)
        pts = []
        for i in range(6):
            a = a0 + i * 0.45
            v = V((math.cos(a), math.sin(a) * math.cos(tilt), math.sin(a) * math.sin(tilt)))
            pts.append(v * 0.4)
        p += curve_limb(pts, 0.035, 0.018, 5, "Bark")
    for k in range(5):  # пятна мха и тины
        a, b = random.uniform(0, math.tau), random.uniform(0.2, 2.9)
        n = V((math.cos(a) * math.sin(b), math.sin(a) * math.sin(b), math.cos(b)))
        mo = sphere(0.13, n * 0.37, (1.2, 1.2, 0.35), 8, 5, random.choice(("Moss", "SwampMoss")))
        mo.rotation_mode = "QUATERNION"
        mo.rotation_quaternion = V((0, 0, 1)).rotation_difference(n)
        p.append(mo)
    for k in range(4):  # торчащие стебли камыша
        a, b = random.uniform(0, math.tau), random.uniform(0.3, 2.8)
        n = V((math.cos(a) * math.sin(b), math.sin(a) * math.sin(b), math.cos(b)))
        p.append(limb(n * 0.34, n * 0.34 + (n + V((random.uniform(-0.4, 0.4), 0, 0.3))).normalized() * 0.28, 0.012, 0.004, 3, "Reed"))
    for k in range(2):  # кости
        a, b = random.uniform(0, math.tau), random.uniform(0.6, 2.5)
        n = V((math.cos(a) * math.sin(b), math.sin(a) * math.sin(b), math.cos(b)))
        side = n.cross(V((0, 0, 1))).normalized()
        p.append(limb(n * 0.36 - side * 0.1, n * 0.38 + side * 0.12, 0.022, 0.02, 5, "Bone"))
        p.append(sphere(0.03, n * 0.38 + side * 0.13, seg=6, rings=4, mat="Bone"))
    join(p, "MudBall")
    export("mudball")


PALETTE.update({"Mud": "#3b3325"})
for build in (swamp_bush, root_tangle, glow_stump, cattail, mudball):
    build()
preview(["swamp_bush", "root_tangle", "glow_stump", "cattail", "mudball"])
