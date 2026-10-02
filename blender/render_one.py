"""Крупный план одной модели в трёх ракурсах: docs/<имя>.png

Запуск:  "D:\\blender\\blender.exe" -b -P blender/render_one.py -- hero
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
name = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "hero"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for i, rot in enumerate((0.6, -0.5, math.pi - 0.5)):  # три четверти, другой бок, спина
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "models", name + ".glb"))
    pivot = bpy.data.objects.new(f"pv{i}", None)
    bpy.context.collection.objects.link(pivot)
    for o in [o for o in bpy.data.objects if o.name not in before]:
        if o.parent is None and o is not pivot:
            o.parent = pivot
    pivot.location = (i * 0.9, 0, 0)
    pivot.rotation_euler = (0, 0, rot)

bpy.ops.mesh.primitive_plane_add(size=20, location=(0.9, 0, 0))
floor = bpy.context.view_layer.objects.active
mat = bpy.data.materials.new("Floor")
mat.diffuse_color = (0.55, 0.52, 0.47, 1)
floor.data.materials.append(mat)

view = Vector((0.0, -1.0, 0.55)).normalized()
target = Vector((0.9, 0, 0.5))
bpy.ops.object.camera_add(location=target + view * 20)
cam = bpy.context.view_layer.objects.active
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.9
cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "STUDIO"
sh.color_type = "TEXTURE"  # текстуры видны; у материалов без текстуры — их цвет
sh.show_cavity = True
sh.show_shadows = True
sh.shadow_intensity = 0.3
sh.show_object_outline = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 560
world = bpy.data.worlds.new("World")
world.color = (0.6, 0.57, 0.52)
scene.world = world
scene.render.filepath = os.path.join(ROOT, "docs", name + ".png")
bpy.ops.render.render(write_still=True)
print("rendered", scene.render.filepath)
