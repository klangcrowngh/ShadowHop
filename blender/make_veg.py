"""Лесная растительность: лиственный куст, куст с ягодами, папоротник,
поваленный ствол, молодое деревце.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_veg.py

Отдельно от make_models.py (тот пересобирает все модели, включая героя).
Результат: models/bush_leafy.glb, bush_berry.glb, fern.glb, fallen_log.glb, sapling.glb
и превью docs/veg.png. Всё помещается в одну клетку; низ на z = 0.
Листва — материалы Leaf/LeafLight: в игре она покачивается на ветру.
"""
import math
import os
import random

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "make_models.py"), encoding="utf-8").read()
src = src.split("# =============================================================================\n# Персонажи")[0]
exec(compile(src, "make_models_helpers", "exec"))

PALETTE.update({"LeafLight": "#5b7f45", "Berry": "#8e2230"})
PREVIEW = os.path.join(ROOT, "docs", "veg.png")


def leaf_mesh(pos, normal, length, width, mat):
    """Один лист: плоский заострённый ромбик (8 треугольников), лицом наружу, кончиком вниз-наружу."""
    lf = diamond(length, width, mat)
    lf.location = pos
    n = V(normal).normalized()
    down = V((0, 0, -1))
    tip = (down - n * down.dot(n))  # кончик свисает вдоль поверхности вниз
    if tip.length < 1e-3:
        tip = V((1, 0, 0)) - n * V((1, 0, 0)).dot(n)
    tip = (tip.normalized() + V((random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), 0))).normalized()
    tip = (tip - n * tip.dot(n)).normalized()
    side = n.cross(tip)
    lift = random.uniform(0.35, 0.75)          # лист отогнут от кроны наружу — видно его лицо
    tip = (tip * math.cos(lift) + n * math.sin(lift)).normalized()
    face = side.cross(tip).normalized()
    from mathutils import Matrix
    m = Matrix((side, tip, face)).transposed()   # локальные X=бок, Y=вдоль листа, Z=лицо
    lf.rotation_mode = "QUATERNION"
    lf.rotation_quaternion = m.to_quaternion()
    return lf


def diamond(length, width, mat):
    """Лист-ромбик с небольшой толщиной — виден с обеих сторон; кончик по +Y."""
    bm = bmesh.new()
    t = width * 0.12
    tip = bm.verts.new((0, length * 0.7, 0))
    base = bm.verts.new((0, -length * 0.3, 0))
    l = bm.verts.new((-width, length * 0.1, 0))
    r = bm.verts.new((width, length * 0.1, 0))
    up = bm.verts.new((0, length * 0.1, t))
    dn = bm.verts.new((0, length * 0.1, -t))
    for a, b in ((tip, l), (l, base), (base, r), (r, tip)):
        bm.faces.new((a, b, up))
        bm.faces.new((b, a, dn))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("Leaf")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Leaf", me)
    bpy.context.collection.objects.link(o)
    return M(o, mat)


def foliage(parts, center, r, mat, seed, leaves=None, flat=0.8):
    """Крона из множества листьев черепицей поверх тёмного каркаса — рваный живой силуэт."""
    random.seed(seed)
    if leaves is None:
        leaves = max(14, int(46 * (r / 0.25) ** 2))  # мелким шапкам — меньше листьев
    c = V(center)
    core = sphere(r * 0.7, c, (1, 1, flat), 7, 5, "Leaf")   # тёмный каркас, чтобы не было просветов
    jitter(core, r * 0.1, 6, seed)
    parts.append(core)
    shades = ("Leaf", "LeafLight", "LeafLight", "Leaf", "Moss") if mat == "LeafLight" else ("Leaf", "Leaf", "LeafLight", "Moss")
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(leaves):  # точки по сфере (спираль Фибоначчи), низ реже
        z = 1 - (i + 0.5) / leaves * 1.7
        rad = math.sqrt(max(0.0, 1 - z * z))
        a = i * golden + random.uniform(-0.2, 0.2)
        n = V((math.cos(a) * rad, math.sin(a) * rad, z * 0.85)).normalized()
        pos = c + V((n.x * r, n.y * r, n.z * r * flat)) * random.uniform(0.78, 0.95)
        size = r * random.uniform(0.42, 0.58)
        parts.append(leaf_mesh(pos, n, size, size * 0.5, random.choice(shades)))


def stems(parts, n, height, spread, seed):
    random.seed(seed)
    for i in range(n):
        a = random.uniform(0, math.tau)
        tip = V((math.cos(a) * spread * random.uniform(0.4, 1), math.sin(a) * spread * random.uniform(0.4, 1), height * random.uniform(0.6, 1)))
        parts += curve_limb([(0, 0, 0), tip * 0.5 + V((0, 0, 0.05)), tip], 0.03, 0.01, 5, "Bark")


def bush_leafy():
    reset()
    random.seed(61)
    p = []
    stems(p, 6, 0.4, 0.25, 61)
    clumps = [((0, 0, 0.36), 0.27, "Leaf"), ((0.2, 0.08, 0.26), 0.2, "LeafLight"), ((-0.2, 0.06, 0.25), 0.21, "Leaf"),
              ((0.05, -0.2, 0.24), 0.2, "LeafLight"), ((-0.08, 0.2, 0.3), 0.2, "Leaf"), ((0.12, 0.02, 0.52), 0.17, "LeafLight"),
              ((-0.14, -0.1, 0.46), 0.16, "Leaf")]
    for k, (c, r, m) in enumerate(clumps):
        foliage(p, c, r, m, 61 + k)
    join(p, "BushLeafy")
    export("bush_leafy")


def bush_berry():
    reset()
    random.seed(62)
    p = []
    stems(p, 5, 0.3, 0.2, 62)
    clumps = [((0, 0, 0.27), 0.22, "Leaf"), ((0.16, 0.06, 0.2), 0.16, "LeafLight"), ((-0.15, 0.05, 0.19), 0.17, "Leaf"),
              ((0.02, -0.16, 0.18), 0.15, "LeafLight"), ((-0.03, 0.12, 0.36), 0.14, "LeafLight")]
    for k, (c, r, m) in enumerate(clumps):
        foliage(p, c, r, m, 62 + k)
    for k in range(9):  # грозди ягод
        a = random.uniform(0, math.tau)
        b = random.uniform(0.3, 1.2)
        base = V((0, 0, 0.25)) + V((math.cos(a) * math.sin(b) * 0.27, math.sin(a) * math.sin(b) * 0.27, math.cos(b) * 0.2))
        for j in range(3):
            off = V((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.02)))
            p.append(sphere(random.uniform(0.024, 0.032), base + off, seg=5, rings=3, mat="Berry"))
    join(p, "BushBerry")
    export("bush_berry")


def fern():
    reset()
    random.seed(63)
    p = []
    for i in range(8):
        a = i / 8 * math.tau + random.uniform(-0.2, 0.2)
        d = V((math.cos(a), math.sin(a), 0))
        ln = random.uniform(0.32, 0.46)
        # стебель вайи: вверх и наружу, кончик поникает
        pts = [V((0, 0, 0)), d * ln * 0.3 + V((0, 0, ln * 0.45)), d * ln * 0.75 + V((0, 0, ln * 0.55)), d * ln + V((0, 0, ln * 0.35))]
        p += curve_limb(pts, 0.012, 0.004, 3, "Leaf")
        side = V((-d.y, d.x, 0))
        for k in range(5):  # пёрышки по обе стороны стебля, к кончику мельче
            t = 0.2 + k * 0.15
            j = min(2, int(t * 3))
            base = pts[j].lerp(pts[j + 1], t * 3 - j)
            sz = 0.08 * (1.1 - t)
            for sgn in (-1, 1):
                leaf = diamond(sz, sz * 0.35, "Leaf" if k % 2 else "LeafLight")
                leaf.location = base + side * sgn * sz * 0.45
                leaf.rotation_euler = (0.25, 0, math.atan2(d.y, d.x) + sgn * 1.2 - math.pi / 2)
                p.append(leaf)
    join(p, "Fern")
    export("fern")


def fallen_log():
    reset()
    random.seed(64)
    length, r = 0.92, 0.2
    o = cyl(r, length, (0, 0, r * 0.9), (0, math.pi / 2, 0), 12, "Bark")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.01]
    bmesh.ops.subdivide_edges(bm, edges=side, cuts=4, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    for v in o.data.vertices:
        ang = math.atan2(v.co.y, v.co.x)
        rr = math.hypot(v.co.x, v.co.y)
        if rr > 0.14:
            k = (0.93 if math.sin(ang * 8 + v.co.z * 3) > 0.5 else 1.0) * (1 + noise.noise(V((v.co.z * 3, ang, 9.0))) * 0.08)
            v.co.x *= k
            v.co.y *= k
    p = [o]
    p.append(cyl(r * 0.85, 0.02, (length / 2, 0, r * 0.9), (0, math.pi / 2, 0), 12, "Wood"))       # срез
    for rr in (0.06, 0.11):
        p.append(torus(rr, 0.008, (length / 2 + 0.012, 0, r * 0.9), (0, math.pi / 2, 0), 14, mat="WoodDark"))
    p.append(cyl(r * 0.8, 0.02, (-length / 2, 0, r * 0.9), (0, math.pi / 2, 0), 8, "WoodDark"))  # тёмный облом
    for k in range(4):  # короткие щепки по краю облома
        a = k / 4 * math.tau + 0.4
        p.append(cone(0.035, 0.0, 0.06, (-length / 2 - 0.02, math.cos(a) * 0.13, r * 0.9 + math.sin(a) * 0.13), 4, "Wood", (0, -math.pi / 2, 0)))
    p.append(sphere(0.13, (-0.08, 0.02, r * 1.72), (1.6, 0.9, 0.28), 8, 5, "Moss"))   # пятна мха сверху
    p.append(sphere(0.08, (0.26, 0.05, r * 1.7), (1.4, 1.0, 0.28), 8, 4, "Moss"))
    for x, y in ((0.12, -0.19), (-0.2, -0.18), (0.3, 0.18)):  # грибы-трутовики на боку
        p.append(sphere(0.07, (x, y, r * 0.95), (1.0, 0.8, 0.28), 10, 5, "Stem"))
    for x in (-0.3, 0.05):  # маленькие грибы у ствола
        p += curve_limb([(x, -0.26, 0), (x, -0.27, 0.07)], 0.012, 0.01, 6, "Stem")
        p.append(sphere(0.04, (x, -0.27, 0.08), (1, 1, 0.5), 8, 5, "CapRed"))
    for k in range(3):  # сучья
        x = random.uniform(-0.3, 0.3)
        a = random.uniform(0.4, 2.6)
        base = V((x, math.cos(a) * r * 0.9, r * 0.9 + math.sin(a) * r * 0.9))
        p.append(limb(base, base + V((random.uniform(-0.1, 0.1), math.cos(a), math.sin(a))).normalized() * 0.15, 0.035, 0.012, 5, "Bark"))
    join(p, "FallenLog")
    export("fallen_log")


def sapling():
    """Молодое лиственное дерево: наклонный ствол, ветви в разные стороны на разной
    высоте, на концах — приплюснутые пучки листвы; между ними видно ветки."""
    reset()
    random.seed(65)
    p = []
    trunk = [V((0, 0, 0)), V((0.04, 0.02, 0.4)), V((-0.03, 0.03, 0.8)), V((0.05, -0.02, 1.15))]
    p += curve_limb(trunk, 0.06, 0.02, 7, "Bark")
    tips = [trunk[-1] + V((0.02, 0.0, 0.12))]
    for k, (a, z, ln, up) in enumerate(((0.3, 0.55, 0.42, 0.35), (2.2, 0.7, 0.38, 0.45), (3.9, 0.82, 0.4, 0.4),
                                        (5.2, 0.95, 0.32, 0.55), (1.2, 1.02, 0.3, 0.6))):
        base = trunk[1].lerp(trunk[3], (z - 0.4) / 0.75)
        d = V((math.cos(a), math.sin(a), up)).normalized()
        mid = base + d * ln * 0.55 + V((0, 0, 0.04))
        tip = base + d * ln
        p += curve_limb([base, mid, tip], 0.028, 0.01, 5, "Bark")
        tips.append(tip)
        if k % 2 == 0:  # веточка вбок
            p.append(limb(mid, mid + V((-d.y, d.x, 0.3)).normalized() * 0.14, 0.012, 0.004, 4, "Bark"))
    for k, t in enumerate(tips):
        r = 0.2 if k == 0 else random.uniform(0.15, 0.2)
        foliage(p, t + V((0, 0, 0.04)), r, "LeafLight" if k % 2 else "Leaf", 65 + k, flat=0.6)
    p.append(sphere(0.14, (0, 0, 0.0), (1.4, 1.4, 0.25), 8, 5, "Moss"))  # мох у корней
    join(p, "Sapling")
    export("sapling")


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
    center = V((width / 2, 0, 0.5))
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
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 700
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


for build in (bush_leafy, bush_berry, fern, fallen_log, sapling):
    build()
preview(["bush_leafy", "bush_berry", "fern", "fallen_log", "sapling"])
