"""Призрак — модель пользователя (blender/ghost_source.glb) → models/ghost.glb.

Запуск:  "D:\blender\blender.exe" -b -P blender/import_ghost.py

Ставит модель низом на z = 0 по центру, уменьшает до высоты ~0,95 (лицо и так смотрит
в -Y — в игре +Z), текстуру ужимает до 512 px, материал называет Ghost: в игре он
полупрозрачный со светящейся кромкой, тёмные глаза и рот из текстуры остаются плотными.
"""
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HEIGHT = 0.95

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "ghost_source.glb"))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
o.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mn = Vector([min(v.co[k] for v in o.data.vertices) for k in range(3)])
mx = Vector([max(v.co[k] for v in o.data.vertices) for k in range(3)])
k = HEIGHT / (mx.z - mn.z)
shift = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
for v in o.data.vertices:
    v.co = (v.co - shift) * k
o.name = "Ghost"
for m in o.data.materials:
    m.name = "Ghost"
for img in bpy.data.images:
    if img.size[0] > 512:
        img.scale(512, 512)
for obj in list(bpy.data.objects):
    if obj is not o:
        bpy.data.objects.remove(obj)
bpy.ops.object.select_all(action="SELECT")
path = os.path.join(ROOT, "models", "ghost.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_image_format="JPEG")
print("exported", path, "scale", round(k, 3))
