"""Паровой молот для лесопилки: станина, боёк и секции перегородки ряда.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_press.py

Отдельно от make_models.py, потому что тот пересобирает все модели (в том числе
заменил бы присланного героя). Общие инструменты берутся из make_models.py.
Результат: models/press_frame.glb, press_head.glb, press_wall_a/b/c.glb
и превью docs/press.png.

Координаты (как у остальных моделей): 1 = клетка, низ на z = 0, «перед» — -Y.
  press_frame — станина по центру клетки; низ балки — на высоте 1.83;
  press_head  — боёк, начало координат — низ ударной плиты (игра двигает его по высоте);
  press_wall_* — секция перегородки шириной ровно в клетку: перила и труба
                 на одной высоте у всех секций, чтобы соседние сливались в линию.
"""
import math
import os
import random

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "make_models.py"), encoding="utf-8").read()
src = src.split("# =============================================================================\n# Персонажи")[0]
exec(compile(src, "make_models_helpers", "exec"))

PALETTE.update({"Hazard": "#c99a22", "Brass": "#a07a3a", "Glass": "#d9d4c0"})
PREVIEW = os.path.join(ROOT, "docs", "press.png")


def rivets(parts, xs, ys, zs, r=0.022):
    for x in xs:
        for y in ys:
            for z in zs:
                parts.append(sphere(r, (x, y, z), seg=6, rings=4, mat="Steel"))


def press_frame():
    reset()
    p = []
    # основание — литая плита с болтами
    p.append(box((1.36, 0.86, 0.1), (0, 0, 0.05), mat="StoneDark", bev=0.02))
    # две чугунные колонны с рёбрами и заклёпками
    for s in (-1, 1):
        x = s * 0.6
        p.append(box((0.2, 0.34, 1.86), (x, 0, 1.0), mat="SteelDark", bev=0.02))
        p.append(box((0.26, 0.4, 0.14), (x, 0, 0.17), mat="SteelDark", bev=0.02))   # башмак колонны
        p.append(box((0.08, 0.06, 1.6), (x, -0.2, 0.95), mat="SteelDark", bev=0.01))  # ребро спереди
        rivets(p, [x - 0.07, x + 0.07], [-0.175], [0.4, 0.8, 1.2, 1.6])
        # жёлто-чёрные полосы у основания колонны
        for k in range(3):
            p.append(box((0.21, 0.35, 0.07), (x, 0, 0.3 + k * 0.14), mat="Hazard" if k % 2 == 0 else "Coal", bev=0.004))
    # траверса сверху
    p.append(box((1.56, 0.46, 0.36), (0, 0, 2.01), mat="SteelDark", bev=0.03))
    p.append(box((1.64, 0.5, 0.08), (0, 0, 2.21), mat="Steel", bev=0.015))
    rivets(p, [-0.6, -0.3, 0.3, 0.6], [-0.235], [1.95, 2.08])
    # паровой цилиндр над траверсой с латунными бандажами
    p.append(cyl(0.24, 0.56, (0, 0, 2.53), verts=18, mat="Steel"))
    p.append(cyl(0.27, 0.06, (0, 0, 2.83), verts=18, mat="SteelDark"))
    for z in (2.33, 2.53, 2.73):
        p.append(torus(0.245, 0.022, (0, 0, z), seg=20, mat="Brass"))
    # манометр на цилиндре — смотрит в камеру
    p.append(cyl(0.1, 0.05, (0.0, -0.26, 2.55), (math.pi / 2, 0, 0), 16, "Brass"))
    p.append(cyl(0.08, 0.02, (0.0, -0.29, 2.55), (math.pi / 2, 0, 0), 16, "Glass"))
    p.append(box((0.012, 0.01, 0.07), (0.02, -0.305, 2.57), (0, 0.6, 0), mat="Coal", bev=0))  # стрелка
    # паропровод: от цилиндра вниз по колонне к земле, с вентилем
    p += curve_limb([(0.22, 0, 2.6), (0.5, 0, 2.6), (0.82, 0.05, 2.45), (0.82, 0.05, 0.25), (0.82, 0.05, 0.08)], 0.05, 0.05, 10, "Rust")
    p.append(torus(0.1, 0.018, (0.82, -0.08, 1.1), (math.pi / 2, 0, 0), seg=16, mat="CapRed"))
    p.append(cyl(0.02, 0.1, (0.82, -0.03, 1.1), (math.pi / 2, 0, 0), 8, "Steel"))
    # направляющие бойка на внутренних сторонах колонн
    for s in (-1, 1):
        p.append(box((0.04, 0.12, 1.6), (s * 0.49, 0, 1.03), mat="Steel", bev=0.005))
    join(p, "PressFrame")
    export("press_frame")


def press_head():
    reset()
    p = []
    # ударная плита с жёлто-чёрной «ёлочкой» спереди
    p.append(box((0.9, 0.66, 0.1), (0, 0, 0.05), mat="SteelDark", bev=0.015))
    n = 7
    for k in range(n):
        x = -0.4 + k * (0.8 / (n - 1))
        p.append(box((0.07, 0.02, 0.12), (x, -0.335, 0.06), (0, 0.6, 0), mat="Hazard" if k % 2 == 0 else "Coal", bev=0.003))
    p.append(box((0.92, 0.012, 0.04), (0, -0.335, 0.005), mat="Hazard", bev=0))
    # массивный боёк
    p.append(box((0.8, 0.6, 0.34), (0, 0, 0.27), mat="SteelDark", bev=0.03))
    p.append(box((0.84, 0.64, 0.05), (0, 0, 0.41), mat="Steel", bev=0.01))
    rivets(p, [-0.3, -0.1, 0.1, 0.3], [-0.305], [0.22, 0.33])
    # уши-ползуны по бокам (ходят по направляющим станины)
    for s in (-1, 1):
        p.append(box((0.06, 0.2, 0.3), (s * 0.43, 0, 0.27), mat="Steel", bev=0.01))
    # крепление штока
    p.append(cyl(0.12, 0.08, (0, 0, 0.47), verts=14, mat="Brass"))
    join(p, "PressHead")
    export("press_head")


def wall_base(p):
    """Общая для всех секций часть: цоколь, стойки перил, две трубы-перила на одной высоте."""
    p.append(box((1.0, 0.7, 0.12), (0, 0.05, 0.06), mat="StoneDark", bev=0.015))
    for x in (-0.47, 0.47):
        p.append(box((0.07, 0.07, 1.0), (x, 0.3, 0.55), mat="SteelDark", bev=0.008))
    for z in (0.62, 1.02):
        p.append(cyl(0.035, 1.0, (0, 0.3, z), (0, math.pi / 2, 0), 10, "Rust"))


def press_wall_a():
    """Ящики и бочка у перил."""
    reset()
    random.seed(31)
    p = []
    wall_base(p)
    p += crate_parts((-0.18, -0.02, 0.12), 0.46, 0.15)
    p += crate_parts((-0.2, 0.0, 0.58), 0.36, -0.2)
    p.append(cyl(0.18, 0.5, (0.27, -0.05, 0.37), verts=14, mat="Wood"))
    for z in (0.2, 0.52):
        p.append(torus(0.185, 0.015, (0.27, -0.05, z), seg=18, mat="SteelDark"))
    join(p, "PressWallA")
    export("press_wall_a")


def press_wall_b():
    """Паровой котёл: лежащий цилиндр на опорах, манометр, патрубок."""
    reset()
    p = []
    wall_base(p)
    p.append(cyl(0.27, 0.86, (0, -0.02, 0.48), (0, math.pi / 2, 0), 18, "Rust"))
    for x in (-0.3, 0.3):
        p.append(torus(0.275, 0.02, (x, -0.02, 0.48), (0, math.pi / 2, 0), seg=18, mat="SteelDark"))
        p.append(box((0.1, 0.44, 0.22), (x, -0.02, 0.2), mat="SteelDark", bev=0.01))
    p.append(cyl(0.07, 0.04, (0.12, -0.3, 0.6), (math.pi / 2, 0, 0), 14, "Brass"))
    p.append(cyl(0.055, 0.015, (0.12, -0.325, 0.6), (math.pi / 2, 0, 0), 14, "Glass"))
    p.append(cyl(0.05, 0.3, (-0.15, -0.02, 0.85), verts=10, mat="Steel"))
    p.append(cyl(0.07, 0.05, (-0.15, -0.02, 1.0), verts=10, mat="Brass"))
    join(p, "PressWallB")
    export("press_wall_b")


def press_wall_c():
    """Верстак: столешница, тиски, шестерня, табличка «опасно»."""
    reset()
    p = []
    wall_base(p)
    p.append(box((0.9, 0.5, 0.07), (0, -0.02, 0.62), mat="Wood", bev=0.01))
    for x in (-0.38, 0.38):
        for y in (-0.2, 0.16):
            p.append(box((0.06, 0.06, 0.56), (x, y, 0.32), mat="WoodDark", bev=0.006))
    p.append(box((0.8, 0.4, 0.04), (0, -0.02, 0.2), mat="WoodDark", bev=0.006))  # полка
    p.append(box((0.14, 0.1, 0.12), (-0.25, -0.12, 0.72), mat="Steel", bev=0.01))  # тиски
    p.append(box((0.03, 0.18, 0.03), (-0.25, -0.2, 0.74), mat="Steel", bev=0))
    g = cog(0.14, 9, 0.05, 0.05, "Rust")
    g.location = (0.2, -0.05, 0.8)
    g.rotation_euler = (math.pi / 2, 0, 0)
    p.append(g)
    # табличка с жёлтым треугольником на перилах
    p.append(box((0.3, 0.02, 0.24), (0.0, 0.27, 0.86), mat="Hazard", bev=0.004))
    p.append(cone(0.07, 0.0, 0.1, (0.0, 0.255, 0.86), 3, "Coal", (math.pi / 2, 0, 0)))
    join(p, "PressWallC")
    export("press_wall_c")


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
        pivot.location = (idx * 1.7, 0, 0.6 if name == "press_head" else 0)
        pivot.rotation_euler = (0, 0, 0.5)
    bpy.ops.mesh.primitive_plane_add(size=60, location=(3.4, 0, -0.002))
    M(active(), "Antler")
    view = V((0.0, -1.0, 0.7)).normalized()
    center = V((3.4, 0, 1.1))
    bpy.ops.object.camera_add(location=center + view * 40)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 9.5
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
    scene.render.resolution_y = 900
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


def crate_parts(center=(0, 0, 0), size=0.72, rot=0.0):
    """Ящик из досок (как в make_models.crate_parts) — копия, чтобы не тянуть весь файл."""
    cx, cy, cz = center
    s = size
    p = [box((s, s, s), (cx, cy, cz + s / 2), (0, 0, rot), mat="Wood", bev=0.02)]
    for dz in (0.06, s - 0.06):
        p.append(box((s + 0.02, s + 0.02, 0.07), (cx, cy, cz + dz), (0, 0, rot), mat="WoodDark", bev=0.01))
    return p


def vent():
    """Паровой клапан в полу: чугунная плита с ободом, решётка над тёмной шахтой,
    болты, сбоку патрубок с вентилем. Верх решётки — на высоте ~0.06."""
    reset()
    p = []
    p.append(box((0.9, 0.9, 0.035), (0, 0, 0.0175), mat="SteelDark", bev=0.012))
    for s in (-1, 1):  # обод
        p.append(box((0.9, 0.08, 0.05), (0, s * 0.41, 0.045), mat="Steel", bev=0.01))
        p.append(box((0.08, 0.9, 0.05), (s * 0.41, 0, 0.045), mat="Steel", bev=0.01))
    p.append(box((0.72, 0.72, 0.01), (0, 0, 0.036), mat="Coal", bev=0))   # тёмная шахта под решёткой
    for k in range(7):  # прутья решётки
        x = -0.3 + k * 0.1
        p.append(box((0.035, 0.74, 0.03), (x, 0, 0.055), mat="SteelDark", bev=0.006))
    p.append(box((0.74, 0.03, 0.028), (0, 0, 0.058), mat="SteelDark", bev=0.006))
    for x in (-0.41, 0.41):
        for y in (-0.41, 0.41):
            p.append(cyl(0.022, 0.02, (x, y, 0.075), verts=6, mat="Steel"))
    # жёлто-чёрная окантовка — видно, что наступать опасно
    for k in range(8):
        a = k / 8 * math.tau
        p.append(box((0.1, 0.03, 0.006), (math.cos(a) * 0.46, math.sin(a) * 0.46, 0.004), (0, 0, a + 0.8),
                     mat="Hazard" if k % 2 == 0 else "Coal", bev=0))
    # патрубок с вентилем сбоку
    p += curve_limb([(0.45, 0.2, 0.03), (0.55, 0.2, 0.05), (0.6, 0.2, 0.12)], 0.035, 0.035, 8, "Rust")
    p.append(torus(0.06, 0.012, (0.6, 0.2, 0.16), seg=12, mat="CapRed"))
    join(p, "Vent")
    export("vent")


for build in (press_frame, press_head, press_wall_a, press_wall_b, press_wall_c, vent):
    build()
preview(["press_frame", "press_head", "press_wall_a", "press_wall_b", "press_wall_c", "vent"])
