"""Рендер glb с четырёх сторон (спереди -Y, справа +X, сзади +Y, слева -X) с текстурами.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/views_glb.py -- <путь.glb> <выход.png>
"""
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
path, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for i, rot in enumerate((0, -math.pi / 2, math.pi, math.pi / 2)):
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=path)
    pivot = bpy.data.objects.new(f"pv{i}", None)
    bpy.context.collection.objects.link(pivot)
    for o in [o for o in bpy.data.objects if o.name not in before]:
        if o.parent is None and o is not pivot:
            o.parent = pivot
    pivot.location = (i * 1.3, 0, 0)
    pivot.rotation_euler = (0, 0, rot)

view = Vector((0, -1, 0.15)).normalized()
target = Vector((1.95, 0, 0))
bpy.ops.object.camera_add(location=target + view * 30)
cam = bpy.context.view_layer.objects.active
cam.data.type = "ORTHO"
cam.data.ortho_scale = 5.6
cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "FLAT"
sh.color_type = "TEXTURE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 560
world = bpy.data.worlds.new("W")
world.color = (0.5, 0.5, 0.5)
scene.world = world
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("rendered", out)
