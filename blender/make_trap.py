"""Капкан (лес): раскрытые стальные челюсти с зубьями, пружины-рычаги, тарелка-спуск,
цепь к колышку, пара листьев. Челюсти — объекты JawA/JawB с осью вдоль X
(в z = 0,03): игра поворачивает их вокруг X, и капкан захлопывается.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_trap.py
Результат: models/bear_trap.glb и превью docs/trap.png.
"""
import math
import os
import random

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "make_models.py"), encoding="utf-8").read()
src = src.split("# =============================================================================\n# Персонажи")[0]
exec(compile(src, "make_models_helpers", "exec"))

R = 0.22     # радиус челюстей
HZ = 0.03    # высота оси


def jaw(side, name):
    """Полукольцо челюсти на стороне side (+1/-1 по Y) с зубьями внутрь."""
    p = []
    pts = [V((math.cos(a) * R, side * math.sin(a) * R, HZ)) for a in [k / 10 * math.pi for k in range(11)]]
    p += curve_limb(pts, 0.014, 0.014, 5, "SteelDark")
    for k in range(1, 10):
        a = k / 10 * math.pi
        base = V((math.cos(a) * R, side * math.sin(a) * R, HZ))
        tip = base * 0.72 + V((0, 0, HZ * 0.28))
        p.append(limb(base, tip, 0.016, 0.001, 4, "Steel"))
    o = join(p, name)
    set_origin(o, (0, 0, HZ))
    return o


def bear_trap():
    reset()
    random.seed(171)
    p = [box((0.5, 0.06, 0.025), (0, 0, 0.012), mat="SteelDark"),                 # основание
         cyl(0.07, 0.02, (0, 0, 0.03), verts=14, mat="Rust"),                      # тарелка-спуск
         cyl(0.03, 0.03, (0, 0, 0.04), verts=8, mat="SteelDark")]
    for s in (-1, 1):  # пружины-рычаги по бокам
        p += curve_limb([(s * 0.22, 0, HZ), (s * 0.34, 0, 0.04), (s * 0.46, 0, 0.025)], 0.016, 0.012, 5, "SteelDark")
        p.append(torus(0.035, 0.01, (s * 0.46, 0, 0.03), (math.pi / 2, 0, 0), 10, mat="SteelDark"))
    for k in range(6):  # цепь к колышку
        c = V((0.5 + k * 0.055, 0.04 + k * 0.03, 0.012))
        p.append(torus(0.025, 0.006, c, (0, 0 if k % 2 else math.pi / 2, 0.5), 8, mat="Rust"))
    p.append(limb((0.84, 0.23, 0.12), (0.84, 0.23, -0.02), 0.025, 0.01, 5, "WoodDark"))  # колышек
    for k in range(3):  # сухие листья вокруг
        a = random.uniform(0, math.tau)
        p.append(box((0.07, 0.045, 0.004), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.004), (0, 0, random.uniform(0, 3)),
                     mat=random.choice(("Wood", "Rust")), bev=0.001))
    join(p, "TrapBase")
    jaw(1, "JawA")
    jaw(-1, "JawB")
    export("bear_trap")


def preview():
    reset()
    scene = bpy.context.scene
    for idx, closed in enumerate((0.0, 1.45)):
        before = {o.name for o in bpy.data.objects}
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "bear_trap.glb"))
        new = [o for o in bpy.data.objects if o.name not in before]
        for o in new:
            if o.parent is None:
                o.location.x += idx * 1.3
            if o.name.startswith("JawA"):
                o.rotation_mode = "XYZ"
                o.rotation_euler.x = closed
            if o.name.startswith("JawB"):
                o.rotation_mode = "XYZ"
                o.rotation_euler.x = -closed
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0.6, 0, -0.002))
    M(active(), "Antler")
    view = V((0.0, -1.0, 1.1)).normalized()
    bpy.ops.object.camera_add(location=V((0.7, 0, 0.1)) + view * 20)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.6
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.show_shadows = True
    sh.show_object_outline = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 600
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = os.path.join(ROOT, "docs", "trap.png")
    bpy.ops.render.render(write_still=True)


bear_trap()
preview()
