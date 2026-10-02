"""Опасности лесной дороги: катящееся бревно и кабан.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_forest.py

Отдельно от make_models.py (тот пересобирает все модели, включая героя).
Результат: models/rolllog.glb, models/boar.glb и превью docs/forest_road.png.

  rolllog — короткое толстое бревно, центр в нуле, ось вдоль Y Blender (поперёк
            ряда в игре): игра катит его вдоль ряда, вращая вокруг этой оси;
  boar    — смотрит в -Y (в игре +Z), низ на z = 0; ноги — объекты Leg0..Leg3
            с pivot в бедре, игра раскачивает их на бегу.
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

PALETTE.update({"BoarFur": "#3a2a20"})
PREVIEW = os.path.join(ROOT, "docs", "forest_road.png")


def rolllog():
    reset()
    random.seed(41)
    length, r = 0.86, 0.3
    o = cyl(r, length, (0, 0, 0), (math.pi / 2, 0, 0), 14, "Bark")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.01]
    bmesh.ops.subdivide_edges(bm, edges=side, cuts=4, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    for v in o.data.vertices:  # кора бороздами
        ang = math.atan2(v.co.y, v.co.x)
        rr = math.hypot(v.co.x, v.co.y)
        if rr > 0.22:
            groove = 0.94 if math.sin(ang * 9 + v.co.z * 2) > 0.55 else 1.0
            k = groove * (1 + noise.noise(V((v.co.z * 3, ang, 4.0))) * 0.08)
            v.co.x *= k
            v.co.y *= k
    parts = [o]
    for s in (-1, 1):  # свежие срезы с годичными кольцами — видно, что бревно катится
        y = s * length / 2
        parts.append(cyl(r * 0.9, 0.02, (0, y, 0), (math.pi / 2, 0, 0), 14, "Wood"))
        for rr in (0.08, 0.15, 0.22):
            parts.append(torus(rr, 0.01, (0, y + s * 0.012, 0), (math.pi / 2, 0, 0), 16, mat="WoodDark"))
    for i in range(3):  # обломанные сучья
        a = random.uniform(0, math.tau)
        y = random.uniform(-0.25, 0.25)
        base = V((math.cos(a) * 0.27, y, math.sin(a) * 0.27))
        out = V((math.cos(a), random.uniform(-0.3, 0.3), math.sin(a))).normalized()
        parts.append(limb(base, base + out * random.uniform(0.1, 0.16), 0.05, 0.025, 5, "Bark"))
    parts.append(sphere(0.13, (0.0, 0.1, 0.27), (1.4, 1.6, 0.45), 8, 5, "Moss"))
    parts.append(sphere(0.1, (0.2, -0.2, -0.2), (1.2, 1.4, 0.45), 8, 5, "Moss"))
    join(parts, "RollLog")
    export("rolllog")


def boar():
    """Кабан: массивный горбатый корпус, клиновидная голова с пятачком и двумя парами
    клыков, густая грива-щетина, клочья шерсти, раздвоенные копыта."""
    reset()
    random.seed(52)
    scene = bpy.context.scene
    p = []

    # --- корпус: горб на загривке, круп ниже, брюхо светлее -------------------------
    body = sphere(0.3, (0, 0.08, 0.44), (0.8, 1.42, 0.85), 20, 12, "BoarFur")
    jitter(body, 0.03, 6, 2)
    p.append(body)
    hump = sphere(0.26, (0, -0.2, 0.57), (0.88, 1.0, 0.86), 18, 10, "BoarFur")
    jitter(hump, 0.03, 6, 5)
    p.append(hump)
    p.append(sphere(0.22, (0, 0.34, 0.46), (0.82, 0.9, 0.8), 16, 10, "BoarFur"))         # круп
    p.append(sphere(0.2, (0, 0.02, 0.28), (0.95, 1.9, 0.5), 14, 8, "Fur"))               # брюхо
    for s in (-1, 1):  # мускулистые плечи и бёдра — продолжение ног в корпусе
        p.append(sphere(0.13, (s * 0.17, -0.24, 0.4), (0.7, 1.0, 1.25), 12, 8, "BoarFur"))
        p.append(sphere(0.14, (s * 0.16, 0.3, 0.42), (0.7, 1.1, 1.2), 12, 8, "BoarFur"))

    # --- голова ---------------------------------------------------------------------
    skull = limb((0, -0.36, 0.52), (0, -0.62, 0.36), 0.2, 0.11, 12, "BoarFur")
    jitter(skull, 0.012, 8, 7)
    p.append(skull)
    p.append(sphere(0.16, (0, -0.42, 0.44), (1.0, 0.9, 1.0), 14, 8, "BoarFur"))           # щёки
    p.append(limb((0, -0.44, 0.34), (0, -0.62, 0.27), 0.08, 0.05, 10, "BoarFur"))        # нижняя челюсть
    p.append(box((0.1, 0.12, 0.012), (0, -0.6, 0.3), (0.35, 0, 0), mat="Coal", bev=0))   # линия пасти
    # пятачок: плоский диск с кольцом-морщиной и ноздрями
    p.append(cyl(0.09, 0.06, (0, -0.69, 0.33), (math.pi / 2 - 0.25, 0, 0), 16, "SkinShade"))
    p.append(torus(0.075, 0.012, (0, -0.66, 0.335), (math.pi / 2 - 0.25, 0, 0), 16, mat="SkinShade"))
    for s in (-1, 1):
        p.append(sphere(0.022, (s * 0.032, -0.722, 0.34), (1, 0.5, 1.2), 8, 6, "Shadow"))  # ноздри
    for k in range(3):  # морщины на переносице
        p.append(torus(0.1 - k * 0.012, 0.01, (0, -0.56 + k * 0.045, 0.39 + k * 0.02), (math.pi / 2 - 0.5, 0, 0),
                       14, (1, 1, 0.7), "BoarFur"))
    for s in (-1, 1):
        # надбровье и глубокая глазница, в ней — светящийся глаз
        p.append(sphere(0.05, (s * 0.1, -0.5, 0.53), (1.2, 0.9, 0.5), 10, 6, "BoarFur"))
        p.append(sphere(0.034, (s * 0.1, -0.515, 0.49), seg=10, rings=6, mat="Shadow"))
        # верхние клыки — загнуты вверх и наружу, нижние короче
        p += curve_limb([(s * 0.06, -0.62, 0.28), (s * 0.11, -0.67, 0.31), (s * 0.14, -0.67, 0.4), (s * 0.12, -0.63, 0.46)],
                        0.028, 0.006, 7, "Bone")
        p += curve_limb([(s * 0.04, -0.6, 0.27), (s * 0.07, -0.64, 0.3), (s * 0.08, -0.63, 0.35)], 0.018, 0.004, 6, "Bone")
        # уши: торчат назад-вверх, внутри светлее
        ear = cone(0.07, 0.0, 0.15, (s * 0.12, -0.36, 0.7), 6, "BoarFur", (0.35, s * 0.45, s * 0.2))
        ear.scale = (1, 0.45, 1)
        p.append(ear)
        inner = cone(0.045, 0.0, 0.1, (s * 0.12, -0.39, 0.69), 6, "SkinShade", (0.35, s * 0.45, s * 0.2))
        inner.scale = (1, 0.25, 1)
        p.append(inner)
        # клочья шерсти на щеках
        for k in range(4):
            base = V((s * (0.14 + k * 0.01), -0.44 + k * 0.05, 0.36 + k * 0.03))
            p.append(limb(base, base + V((s * 0.09, 0.05, -0.04)), 0.03, 0.004, 4, "BoarFur"))

    # --- грива-щетина по хребту от затылка до крупа --------------------------------------
    for i in range(34):
        u = i / 33
        y = -0.46 + u * 0.8
        z = 0.64 + 0.1 * math.sin(u * math.pi * 0.9) - 0.12 * max(0, u - 0.6)
        for side in (-1, 1):
            base = V((side * random.uniform(0.0, 0.05), y, z))
            ln = random.uniform(0.1, 0.18) * (1.25 - 0.6 * u)
            tip = base + V((side * random.uniform(0.02, 0.06), random.uniform(0.02, 0.07), ln))
            p.append(limb(base, tip, 0.022, 0.002, 4, "Coal"))
    # клочья шерсти по бокам и на плечах — рваный силуэт
    for i in range(22):  # короткие мягкие пряди, прижатые назад и вниз
        a = random.uniform(-1.0, 0.6)
        y = random.uniform(-0.3, 0.38)
        side = random.choice((-1, 1))
        base = V((side * (0.21 + 0.02 * math.cos(a)), y, 0.42 + 0.14 * math.sin(a)))
        out = V((side * 0.35, random.uniform(0.6, 0.9), random.uniform(-0.5, -0.2))).normalized()
        p.append(limb(base, base + out * random.uniform(0.04, 0.06), 0.03, 0.008, 5, "BoarFur"))

    # --- хвост с кисточкой ------------------------------------------------------------
    p += curve_limb([(0, 0.54, 0.5), (0, 0.62, 0.47), (0.02, 0.64, 0.38)], 0.022, 0.01, 6, "BoarFur")
    for k in range(5):
        base = V((0.02, 0.64, 0.38))
        p.append(limb(base, base + V((random.uniform(-0.04, 0.04), random.uniform(0.0, 0.04), -0.07)), 0.012, 0.002, 4, "Coal"))
    join(p, "Body", smooth=True)

    eyes = [sphere(0.022, (s * 0.1, -0.53, 0.49), seg=8, rings=6, mat="Eye") for s in (-1, 1)]
    join(eyes, "Eyes", smooth=True)

    # --- ноги: бедро, голень, раздвоенное копыто, прибылые пальцы; pivot в бедре --------
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        hip = V((sx * 0.15, sy * 0.26 - 0.02, 0.36))
        knee = hip + V((0, 0.03 if sy > 0 else -0.01, -0.17))
        ankle = hip + V((0, 0.0, -0.3))
        leg = [limb(hip, knee, 0.085, 0.055, 10, "BoarFur"),
               sphere(0.055, knee, seg=8, rings=6, mat="BoarFur"),
               limb(knee, ankle, 0.05, 0.035, 8, "BoarFur")]
        for t in (-1, 1):  # два копытца
            leg.append(box((0.036, 0.07, 0.06), ankle + V((t * 0.021, -0.01, -0.03)), (0.15, 0, 0), mat="Coal", bev=0.01))
            leg.append(sphere(0.014, ankle + V((t * 0.03, 0.035, 0.0)), seg=6, rings=4, mat="Coal"))  # прибылые пальцы
        for k in range(3):  # шерсть на голени
            base = knee + V((sx * 0.03, 0.02, -0.02 - k * 0.03))
            leg.append(limb(base, base + V((sx * 0.04, 0.03, -0.03)), 0.014, 0.002, 4, "BoarFur"))
        o = join(leg, f"Leg{i}")
        scene.cursor.location = hip
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        o.rotation_mode = "XYZ"
    export("boar")


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
        pivot.location = (idx * 1.8, 0, 0.3 if name == "rolllog" else 0)
        pivot.rotation_euler = (0, 0, 0.9)
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0.9, 0, -0.002))
    M(active(), "Antler")
    view = V((0.0, -1.0, 0.7)).normalized()
    center = V((0.9, 0, 0.4))
    bpy.ops.object.camera_add(location=center + view * 40)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.6
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
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 800
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


rolllog()
boar()
preview(["rolllog", "boar"])
