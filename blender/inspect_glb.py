"""Печатает сведения о glb: объекты, размеры, материалы, текстуры, анимации.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/inspect_glb.py -- <путь.glb>
"""
import sys

import bpy
from mathutils import Vector

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in bpy.data.objects:
    info = f"OBJ {o.name} type={o.type} parent={o.parent.name if o.parent else None} loc={tuple(round(v, 3) for v in o.location)} rot={tuple(round(v, 3) for v in o.rotation_euler)} scale={tuple(round(v, 3) for v in o.scale)}"
    if o.type == "MESH":
        info += f" verts={len(o.data.vertices)} mats={[m.name for m in o.data.materials if m]}"
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    print(info)
print("BOUNDS min", tuple(round(v, 3) for v in lo), "max", tuple(round(v, 3) for v in hi), "size", tuple(round(v, 3) for v in hi - lo))
for m in bpy.data.materials:
    texs = []
    if m.node_tree:
        texs = [n.image.name + f" {n.image.size[0]}x{n.image.size[1]}" for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    print("MAT", m.name, "textures:", texs)
for a in bpy.data.actions:
    print("ACTION", a.name, "frames", tuple(a.frame_range))
