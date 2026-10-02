"""Кладбище: надгробия, кельтский крест, кованая ограда, свежая могила с лопатой,
склеп, свечи, призрак, поломанные лодки, рука мертвеца и взрытая земля под ней.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_cemetery.py

Отдельно от make_models.py (тот пересобирает все модели, включая героя).
  ghost       — смотрит в -Y (в игре +Z), низ на z = 0; материал Ghost — полупрозрачный;
  boat2/boat3 — лодки вдоль X, дно (где стоит герой) в z = 0;
  zombie_hand — основание на z = 0, игра выдвигает её из-под земли;
  candles     — пламя из материала Flame светится.
Превью: docs/cemetery.png.
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

PALETTE.update({"Ghost": "#cfe3ee", "Flame": "#ffc070", "ZombieSkin": "#6f7d63", "Dirt": "#3b3026", "Marble": "#8b8a84"})


def tombstone():
    """Надгробие: плита с полукруглым верхом на цоколе, рельефный крест, скол, мох."""
    reset()
    random.seed(101)
    p = [box((0.56, 0.24, 0.1), (0, 0, 0.05), mat="StoneDark")]
    slab = box((0.44, 0.12, 0.5), (0, 0, 0.35), mat="Stone", bev=0.015)
    p.append(slab)
    p.append(cyl(0.22, 0.12, (0, 0, 0.6), (math.pi / 2, 0, 0), 16, "Stone"))
    p.append(box((0.04, 0.02, 0.26), (0, -0.065, 0.46), mat="StoneDark"))  # рельефный крест
    p.append(box((0.16, 0.02, 0.04), (0, -0.065, 0.52), mat="StoneDark"))
    for z in (0.26, 0.22):  # строки надписи
        p.append(box((0.24, 0.015, 0.018), (0, -0.065, z), mat="StoneDark"))
    p.append(box((0.1, 0.14, 0.08), (0.19, 0, 0.72), (0.3, 0.4, 0.2), mat="StoneDark"))  # скол
    p.append(sphere(0.1, (-0.16, 0.02, 0.62), (1.2, 1.1, 0.5), 8, 5, "Moss"))
    p.append(sphere(0.12, (0.1, -0.12, 0.08), (1.4, 0.8, 0.3), 8, 5, "Moss"))
    join(p, "Tombstone")
    export("tombstone")


def celtic_cross():
    """Кельтский крест: ступенчатый постамент, крест с кольцом на перекрестье, мох."""
    reset()
    p = [box((0.5, 0.36, 0.14), (0, 0, 0.07), mat="StoneDark"), box((0.34, 0.26, 0.14), (0, 0, 0.21), mat="Stone")]
    p.append(box((0.14, 0.1, 0.95), (0, 0, 0.75), mat="Stone"))
    p.append(box((0.62, 0.1, 0.14), (0, 0, 0.92), mat="Stone"))
    p.append(torus(0.2, 0.035, (0, 0, 0.92), (math.pi / 2, 0, 0), 20, scale=(1, 1, 1), mat="Stone"))
    for dz in (0.35, 0.55):  # резной узор на стволе
        p.append(box((0.08, 0.02, 0.08), (0, -0.055, dz), (0, math.pi / 4, 0), mat="StoneDark"))
    p.append(sphere(0.045, (0, -0.055, 0.92), seg=8, rings=5, mat="StoneDark"))
    p.append(sphere(0.12, (0.1, -0.1, 0.28), (1.3, 1, 0.4), 8, 5, "Moss"))
    p.append(sphere(0.06, (-0.2, 0, 0.95), (1.2, 1.2, 0.6), 8, 5, "Moss"))
    join(p, "CelticCross")
    export("celtic_cross")


def iron_fence():
    """Кованая ограда на клетку: две перекладины, прутья с пиками, столбы с шарами; один прут погнут."""
    reset()
    p = [box((1.0, 0.14, 0.08), (0, 0, 0.04), mat="StoneDark")]
    for z in (0.2, 0.6):
        p.append(box((0.96, 0.025, 0.025), (0, 0, z), mat="SteelDark"))
    for k in range(8):
        x = -0.42 + k * 0.12
        top = 0.78 if k % 2 else 0.72
        if k == 5:  # погнутый прут
            p += curve_limb([(x, 0, 0.08), (x, 0, 0.45), (x + 0.08, -0.06, 0.62)], 0.012, 0.012, 5, "SteelDark")
            continue
        p.append(limb((x, 0, 0.08), (x, 0, top), 0.012, 0.012, 5, "SteelDark"))
        p.append(cone(0.03, 0.0, 0.08, (x, 0, top + 0.03), 4, "SteelDark"))
        p.append(torus(0.03, 0.008, (x + 0.06, 0, 0.4), (math.pi / 2, 0, 0), 8, mat="SteelDark"))  # завитки
    for s in (-1, 1):
        p.append(box((0.07, 0.07, 0.86), (s * 0.48, 0, 0.47), mat="SteelDark"))
        p.append(sphere(0.05, (s * 0.48, 0, 0.93), seg=8, rings=5, mat="SteelDark"))
    p.append(sphere(0.06, (0.3, 0.05, 0.62), (1, 1, 0.5), 6, 4, "Rust"))
    join(p, "IronFence")
    export("iron_fence")


def fresh_grave():
    """Свежая могила: вытянутый холм земли, деревянный крестик в изголовье, воткнутая лопата, комья."""
    reset()
    random.seed(104)
    p = []
    mound = sphere(0.3, (0, 0.02, 0.0), (1.05, 1.5, 0.42), 12, 7, "Dirt")
    jitter(mound, 0.03, 5, 104)
    p.append(mound)
    p.append(box((0.05, 0.04, 0.5), (0, 0.46, 0.25), (0.08, 0, 0), mat="Wood"))  # крестик
    p.append(box((0.26, 0.04, 0.05), (0, 0.46, 0.38), (0.08, 0, 0), mat="Wood"))
    # лопата: черенок наискосок, штык в земле
    p.append(limb((0.18, -0.2, 0.08), (0.32, -0.38, 0.72), 0.02, 0.018, 6, "Wood"))
    p.append(box((0.16, 0.03, 0.04), (0.33, -0.39, 0.73), (0, 0, 0.6), mat="Wood"))
    p.append(box((0.15, 0.02, 0.18), (0.16, -0.18, 0.03), (0.2, 0.3, 0.6), mat="Steel"))
    for k in range(9):  # комья
        a = random.uniform(0, math.tau)
        rr = random.uniform(0.32, 0.5)
        p.append(sphere(random.uniform(0.03, 0.06), (math.cos(a) * rr, math.sin(a) * rr * 1.3, 0.01), (1, 1, 0.7), 6, 4, "Dirt"))
    join(p, "FreshGrave")
    export("fresh_grave")


def crypt():
    """Склеп: каменная коробка, фронтон, колонны у входа, кованая дверь, ступени, крест на крыше."""
    reset()
    random.seed(105)
    p = [box((1.3, 1.2, 0.12), (0, 0.05, 0.06), mat="StoneDark"), box((1.1, 1.0, 1.1), (0, 0.1, 0.67), mat="Stone")]
    # фронтон — треугольная призма
    bm = bmesh.new()
    pts = [(-0.66, -0.45, 1.22), (0.66, -0.45, 1.22), (0, -0.45, 1.62), (-0.66, 0.65, 1.22), (0.66, 0.65, 1.22), (0, 0.65, 1.62)]
    v = [bm.verts.new(q) for q in pts]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("Roof")
    bm.to_mesh(me)
    bm.free()
    roof = bpy.data.objects.new("Roof", me)
    bpy.context.collection.objects.link(roof)
    p.append(M(roof, "StoneDark"))
    p.append(box((1.36, 1.14, 0.08), (0, 0.1, 1.2), mat="StoneDark"))
    for s in (-1, 1):
        p.append(cyl(0.07, 1.0, (s * 0.44, -0.5, 0.67), verts=10, mat="Marble"))
    p.append(box((0.5, 0.04, 0.78), (0, -0.41, 0.52), mat="Shadow"))  # проём
    for k in range(5):  # прутья кованой двери
        p.append(box((0.025, 0.03, 0.74), (-0.2 + k * 0.1, -0.43, 0.5), mat="SteelDark"))
    p.append(box((0.46, 0.03, 0.03), (0, -0.43, 0.6), mat="SteelDark"))
    for k in range(2):  # ступени
        p.append(box((0.7, 0.16, 0.06), (0, -0.6 - k * 0.14, 0.09 - k * 0.05), mat="Stone"))
    p.append(box((0.06, 0.06, 0.34), (0, -0.4, 1.78), mat="Stone"))  # крест
    p.append(box((0.2, 0.06, 0.06), (0, -0.4, 1.84), mat="Stone"))
    p.append(sphere(0.2, (0.45, 0.1, 1.28), (1.3, 1.6, 0.35), 8, 5, "Moss"))
    p.append(sphere(0.15, (-0.5, -0.3, 0.14), (1.5, 1, 0.4), 8, 5, "Moss"))
    join(p, "Crypt")
    export("crypt")


def candles():
    """Свечи на каменном постаменте по колено (сразу видно, что преграда): разной высоты,
    с натёками, огоньки светятся."""
    reset()
    random.seed(106)
    B = 0.42  # верх постамента
    p = [box((0.56, 0.5, 0.08), (0, 0, 0.04), mat="StoneDark", bev=0.015), box((0.42, 0.38, 0.28), (0, 0, 0.22), mat="Stone", bev=0.015),
         box((0.5, 0.44, 0.06), (0, 0, B - 0.03), mat="StoneDark", bev=0.012), box((0.2, 0.015, 0.14), (0, -0.195, 0.22), mat="StoneDark"),
         sphere(0.08, (0.2, -0.18, 0.08), (1.2, 1, 0.5), 8, 5, "Moss")]
    flames = []
    for x, y, h in ((-0.1, 0.04, 0.3), (0.06, -0.06, 0.22), (0.13, 0.08, 0.16), (-0.02, 0.12, 0.12), (-0.14, -0.1, 0.18)):
        r = random.uniform(0.028, 0.04)
        p.append(cyl(r, h, (x, y, B + h / 2), verts=8, mat="Bone"))
        p.append(sphere(r * 1.3, (x + r * 0.6, y, B + h * random.uniform(0.3, 0.8)), (0.6, 0.6, 1.4), 6, 4, "Bone"))  # натёк
        p.append(limb((x, y, B + h), (x, y, B + 0.02 + h), 0.004, 0.004, 3, "Coal"))  # фитиль
        flames.append(sphere(0.018, (x, y, B + 0.04 + h), (1, 1, 1.9), 6, 4, "Flame"))
    for k in range(3):  # застывший воск стекает по краю постамента
        p.append(sphere(0.03, (-0.2 + k * 0.17, -0.19, B - 0.06 - k * 0.02), (0.8, 0.5, 1.8), 6, 4, "Bone"))
    join(p, "Candles")
    join(flames, "CandleFlame")
    export("candles")


def ghost():
    """Призрак-простыня: голова, расширяющийся к низу балахон с рваным краем,
    вытянутые вперёд руки-рукава, тёмные провалы глаз и рта. Смотрит в -Y."""
    reset()
    random.seed(107)
    p = []
    body = cone(0.34, 0.2, 0.55, (0, 0, 0.38), 16, "Ghost")
    for v in body.data.vertices:  # волны по подолу
        if v.co.z < 0:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += math.sin(a * 5) * 0.05
    p.append(body)
    p.append(sphere(0.24, (0, 0, 0.72), (1, 1, 1.05), 14, 9, "Ghost"))
    for k in range(10):  # рваные лоскуты по низу
        a = k / 10 * math.tau + random.uniform(-0.15, 0.15)
        c = (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.08)
        p.append(cone(0.06, 0.0, random.uniform(0.12, 0.2), c, 5, "Ghost", rot=(math.pi, 0, 0)))
    for s in (-1, 1):  # руки тянутся вперёд, рукава свисают
        p += curve_limb([(s * 0.2, -0.02, 0.58), (s * 0.24, -0.22, 0.5), (s * 0.18, -0.4, 0.44)], 0.07, 0.04, 8, "Ghost")
        p.append(cone(0.05, 0.0, 0.14, (s * 0.18, -0.42, 0.36), 5, "Ghost"))
    for s in (-1, 1):
        p.append(sphere(0.045, (s * 0.08, -0.215, 0.76), (1, 0.5, 1.4), 8, 5, "Shadow"))
    p.append(sphere(0.05, (0, -0.225, 0.62), (1, 0.5, 1.3), 8, 5, "Shadow"))
    join(p, "Ghost", smooth=True)
    export("ghost")


def boat(length, seed):
    """Старая лодка вдоль X (дно, где стоит герой, в z = 0): борта из горизонтальных досок
    с тёмными щелями, часть выбита; нос и корма приподняты, внутри шпангоуты, две скамьи,
    уключины и весло поперёк, моток верёвки, обрывок сети, водоросли на бортах, вода на дне.
    На длинной лодке — кованый фонарь на шесте (огонёк светится)."""
    reset()
    random.seed(seed)
    p = []
    L = length * 0.92
    n = length * 6
    half = lambda x: 0.34 * math.sqrt(max(0.04, 1 - (2 * x / L) ** 4))
    broken = {(random.randrange(2, n - 2), random.choice((-1, 1)), random.randrange(0, 3)) for _ in range(length + 1)}
    for k in range(n):
        x0, x1 = -L / 2 + L * k / n, -L / 2 + L * (k + 1) / n
        xm = (x0 + x1) / 2
        w = half(xm)
        seg = x1 - x0 + 0.012
        rise = 0.09 * (2 * xm / L) ** 4  # нос и корма задраны
        p.append(box((seg, w * 2 - 0.05, 0.035), (xm, 0, -0.02 + rise * 0.3), mat="WoodDark", bev=0.003))
        ang = math.atan2(half(x1) - half(x0), seg)
        for s in (-1, 1):
            for j in range(3):  # три доски обшивки одна над другой, между ними щели
                if (k, s, j) in broken:
                    continue
                z = 0.02 + j * 0.075 + rise
                p.append(box((seg, 0.03, 0.065), (xm, s * (w + 0.02 + j * 0.018), z), (s * 0.25, 0, s * ang),
                             mat="Wood" if (j + k) % 3 else "WoodDark", bev=0.003))
            if k % 3 == 1:  # шпангоут изнутри
                p.append(box((0.035, 0.03, 0.2), (xm, s * (w - 0.01), 0.08 + rise), (s * 0.25, 0, 0), mat="WoodDark", bev=0.003))
        if k % 3 == 1:
            p.append(box((0.035, w * 2 - 0.08, 0.02), (xm, 0, 0.005 + rise * 0.3), mat="WoodDark"))
    for s in (-1, 1):  # штевни — нос и корма
        p.append(box((0.07, 0.08, 0.36), (s * (L / 2 + 0.01), 0, 0.14), (0, -s * 0.2, 0), mat="WoodDark"))
        p.append(box((0.12, 0.3, 0.04), (s * (L / 2 - 0.1), 0, 0.2), mat="Wood"))  # носовая площадка
    for x in (-L * 0.18, L * 0.22):  # скамьи
        p.append(box((0.13, 0.62, 0.035), (x, 0, 0.13), mat="Wood", bev=0.006))
        p.append(box((0.03, 0.03, 0.12), (x, 0, 0.06), mat="WoodDark"))
    for s in (-1, 1):  # уключины
        p.append(torus(0.025, 0.007, (-L * 0.18, s * 0.34, 0.26), (0, 0, 0), 8, mat="SteelDark"))
    p.append(box((1.0 * min(1, length / 2.5), 0.04, 0.025), (0, 0.05, 0.16), (0, 0.06, 0.25), mat="Wood"))  # весло поперёк
    p.append(box((0.18, 0.09, 0.015), (0.5 * min(1, length / 2.5), 0.17, 0.17), (0, 0.06, 0.25), mat="Wood"))
    p.append(torus(0.07, 0.02, (L * 0.36, -0.1, 0.03), (0, 0, 0), 14, mat="Rope"))  # моток верёвки
    p.append(torus(0.045, 0.018, (L * 0.36, -0.1, 0.06), (0, 0, 0), 12, mat="Rope"))
    for k in range(6):  # обрывок сети
        p.append(box((0.22, 0.006, 0.006), (-L * 0.36, -0.12 + k * 0.035, 0.012), (0, 0, 0.5), mat="Rope"))
        p.append(box((0.006, 0.2, 0.006), (-L * 0.4 + k * 0.035, -0.04, 0.014), mat="Rope"))
    for k in range(4):  # водоросли на бортах
        x = random.uniform(-L * 0.4, L * 0.4)
        s = random.choice((-1, 1))
        p.append(sphere(0.06, (x, s * (half(x) + 0.05), 0.02), (1.6, 0.4, 0.9), 6, 4, "SwampMoss"))
    p.append(sphere(0.12, (L * 0.05, 0.08, -0.004), (2.4, 1.3, 0.08), 8, 4, "Shadow"))  # вода на дне
    join(p, "Boat")
    if length >= 3:  # фонарь на шесте у кормы
        lamp = [limb((L * 0.44, 0.0, 0.1), (L * 0.44, 0.0, 0.75), 0.018, 0.015, 5, "WoodDark"),
                box((0.18, 0.02, 0.02), (L * 0.44 - 0.08, 0, 0.74), mat="SteelDark"),
                box((0.09, 0.09, 0.12), (L * 0.44 - 0.16, 0, 0.62), mat="SteelDark"),
                cone(0.07, 0.0, 0.06, (L * 0.44 - 0.16, 0, 0.71), 4, "SteelDark")]
        join(lamp, "BoatLamp")
        join([box((0.055, 0.055, 0.08), (L * 0.44 - 0.16, 0, 0.62), mat="Flame", bev=0.004)], "BoatFlame")
    export(f"boat{length}")


def zombie_hand():
    """Рука мертвеца: истлевшее предплечье с лохмотьями рукава, растопыренные
    скрюченные пальцы с когтями. Основание на z = 0."""
    reset()
    random.seed(108)
    p = []
    p += curve_limb([(0, 0, -0.35), (0.02, 0, 0.1), (-0.01, 0.02, 0.36)], 0.075, 0.055, 8, "ZombieSkin")
    cuff = cone(0.11, 0.09, 0.14, (0.01, 0, 0.1), 9, "Cloak")
    for v in cuff.data.vertices:  # рваный край рукава
        if v.co.z > 0:
            v.co.z += random.uniform(-0.05, 0.04)
    p.append(cuff)
    palm = sphere(0.085, (-0.01, 0.02, 0.44), (1.0, 0.55, 1.1), 10, 6, "ZombieSkin")
    p.append(palm)
    for k, a in enumerate((-0.6, -0.25, 0.05, 0.35)):  # четыре пальца веером, согнуты когтями вперёд
        base = V((math.sin(a) * 0.07, 0.02, 0.5 + math.cos(a) * 0.02))
        d = V((math.sin(a) * 0.5, 0, 1)).normalized()
        mid = base + d * 0.1
        tip = mid + d * 0.05 + V((0, -0.07, 0.02))
        p += curve_limb([base, mid, tip], 0.021, 0.014, 5, "ZombieSkin")
        p.append(cone(0.012, 0.0, 0.04, tip + V((0, -0.02, -0.01)), 4, "Bone", rot=(math.pi * 0.7, 0, 0)))
    thumb = V((0.08, 0.0, 0.42))
    p += curve_limb([thumb, thumb + V((0.07, -0.03, 0.06)), thumb + V((0.08, -0.09, 0.08))], 0.022, 0.014, 5, "ZombieSkin")
    p.append(sphere(0.02, (0.02, -0.05, 0.25), (1, 0.6, 1.4), 6, 4, "Bone"))  # торчит кость
    join(p, "ZombieHand")
    export("zombie_hand")


def hand_mound():
    """Взрытая земля там, откуда лезет рука: плоский бугор, трещины, комья, сломанная дощечка."""
    reset()
    random.seed(109)
    o = sphere(0.36, (0, 0, 0), (1.1, 1.0, 0.1), 12, 6, "Dirt")
    jitter(o, 0.02, 6, 109)
    p = [o]
    for k in range(3):  # трещины — ломаные, разной длины, не от центра
        x, y = random.uniform(-0.18, 0.18), random.uniform(-0.18, 0.18)
        a = random.uniform(0, math.pi)
        for j in range(3):
            ln = random.uniform(0.06, 0.11)
            p.append(box((ln, 0.014, 0.01), (x, y, 0.034), (0, 0, a), mat="Shadow", bev=0.002))
            x += math.cos(a) * ln * 0.9
            y += math.sin(a) * ln * 0.9
            a += random.uniform(-0.8, 0.8)
    for k in range(4):  # вздыбленные пласты дёрна
        a = random.uniform(0, math.tau)
        p.append(box((0.12, 0.09, 0.03), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.04), (random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), a),
                     mat=random.choice(("Grass", "Dirt")), bev=0.008))
    for k in range(7):
        a = random.uniform(0, math.tau)
        rr = random.uniform(0.3, 0.45)
        p.append(sphere(random.uniform(0.025, 0.05), (math.cos(a) * rr, math.sin(a) * rr, 0.01), (1, 1, 0.7), 6, 4, "Dirt"))
    p.append(box((0.22, 0.05, 0.02), (0.22, -0.25, 0.02), (0.1, 0, 0.7), mat="Wood"))
    join(p, "HandMound")
    export("hand_mound")


def preview(names, path):
    reset()
    scene = bpy.context.scene
    step = 1.5
    for idx, name in enumerate(names):
        before = {o.name for o in bpy.data.objects}
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + ".glb"))
        pivot = bpy.data.objects.new(f"pv_{name}", None)
        bpy.context.collection.objects.link(pivot)
        for o in [o for o in bpy.data.objects if o.name not in before]:
            if o.parent is None and o is not pivot:
                o.parent = pivot
        pivot.location = (idx * step, 0, 0.25 if name.startswith("boat") else 0)
        pivot.rotation_euler = (0, 0, 0.35)
        if name in ("boat2", "boat3"):
            pivot.scale = (0.6, 0.6, 0.6)
    width = (len(names) - 1) * step
    bpy.ops.mesh.primitive_plane_add(size=80, location=(width / 2, 0, -0.002))
    M(active(), "Antler")
    view = V((0.0, -1.0, 0.7)).normalized()
    center = V((width / 2, 0, 0.6))
    bpy.ops.object.camera_add(location=center + view * 40)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width + 2.0
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
    scene.render.resolution_x = 2000
    scene.render.resolution_y = 600
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("preview", path)



# =============================================================================
# Вторая версия по референсам: высокие надгробия с «плечиками», крестом и
# черепом, ступенчатый памятник, деревянные кресты, кованые ворота, голые деревья,
# новый призрак, череп-снаряд и мелочь на землю
# =============================================================================
tr = open(os.path.join(HERE, "make_models.py"), encoding="utf-8").read()
tr = tr[tr.index("def grow_tree("):tr.index("def tree():")]
exec(compile(tr, "make_models_trees", "exec"))


def arch_slab(w, h, t, loc, mat, shoulder=0.07, rot=(0, 0, 0)):
    """Плита с полукруглым верхом и ступенькой-«плечиком»: основание, плечи, арка."""
    x, y, z = loc
    parts = [box((w, t, h - w / 2), (x, y, z + (h - w / 2) / 2), rot, mat=mat, bev=0.012)]
    parts.append(box((w + shoulder * 2, t + 0.02, 0.05), (x, y, z + h - w / 2 - 0.02), rot, mat=mat, bev=0.01))
    parts.append(cyl(w / 2, t, (x, y, z + h - w / 2), (math.pi / 2, 0, 0), 18, mat))
    return parts


def skull_relief(p, x, y, z, s, mat="StoneDark"):
    """Рельефный череп на лицевой стороне (-Y)."""
    p.append(sphere(0.06 * s, (x, y, z + 0.015 * s), (1, 0.35, 0.95), 10, 6, mat))
    p.append(box((0.06 * s, 0.03 * s, 0.04 * s), (x, y, z - 0.045 * s), mat=mat, bev=0.004))
    for dx in (-0.022, 0.022):
        p.append(sphere(0.015 * s, (x + dx * s, y - 0.018 * s, z + 0.01 * s), (1, 0.5, 1), 6, 4, "Shadow"))
    p.append(cone(0.008 * s, 0.0, 0.02 * s, (x, y - 0.02 * s, z - 0.018 * s), 3, "Shadow", rot=(math.pi, 0, 0)))


def weeds(p, n, r, seed):
    random.seed(seed)
    for k in range(n):
        a = random.uniform(0, math.tau)
        x, y = math.cos(a) * r * random.uniform(0.6, 1), math.sin(a) * r * random.uniform(0.6, 1)
        for j in range(3):
            b = random.uniform(0, math.tau)
            p.append(limb((x, y, 0), (x + math.cos(b) * 0.04, y + math.sin(b) * 0.04, random.uniform(0.07, 0.14)), 0.012, 0.002, 3, "Grass"))


def tombstone():
    """Высокое надгробие: плита с плечиками и полукруглым верхом, крест наверху,
    рельефный череп и строки эпитафии, цоколь, лишайник, трава у основания."""
    reset()
    random.seed(121)
    p = [box((0.6, 0.3, 0.1), (0, 0, 0.05), mat="StoneDark", bev=0.02)]
    p += arch_slab(0.42, 0.72, 0.13, (0, 0, 0.1), "Stone")
    p.append(box((0.04, 0.05, 0.16), (0, 0, 0.9), mat="Stone"))  # крест
    p.append(box((0.12, 0.05, 0.04), (0, 0, 0.94), mat="Stone"))
    skull_relief(p, 0, -0.07, 0.55, 1.4)
    for z in (0.34, 0.29, 0.24):
        p.append(box((random.uniform(0.18, 0.26), 0.012, 0.014), (0, -0.068, z), mat="StoneDark"))
    p.append(box((0.008, 0.02, 0.2), (0.12, -0.066, 0.38), (0, 0.25, 0), mat="Shadow", bev=0.001))  # трещина
    for x, z in ((-0.16, 0.66), (0.14, 0.18), (-0.1, 0.14)):
        p.append(sphere(0.05, (x, -0.06, z), (1.3, 0.3, 0.8), 6, 4, "Moss"))  # лишайник
    weeds(p, 5, 0.3, 121)
    join(p, "Tombstone")
    export("tombstone")


def tombstone_b():
    """Готическое надгробие: стрельчатый верх, отбитый угол, выгравированный крест, заваливается набок."""
    reset()
    random.seed(122)
    p = [box((0.5, 0.26, 0.08), (0, 0, 0.04), mat="StoneDark", bev=0.015)]
    slab = [box((0.36, 0.11, 0.5), (0, 0, 0.33), mat="Stone", bev=0.012)]
    for s in (-1, 1):  # стрельчатая арка — два наклонных клина
        slab.append(box((0.22, 0.11, 0.26), (s * 0.07, 0, 0.62), (0, s * 0.45, 0), mat="Stone", bev=0.012))
    slab.append(box((0.03, 0.02, 0.22), (0, -0.056, 0.42), mat="Shadow", bev=0.002))
    slab.append(box((0.13, 0.02, 0.03), (0, -0.056, 0.47), mat="Shadow", bev=0.002))
    t = join(slab, "Slab")
    t.rotation_euler = (0.12, 0.14, 0)
    p.append(t)
    p.append(box((0.12, 0.1, 0.09), (0.26, -0.12, 0.05), (0.4, 0.3, 0.8), mat="Stone"))  # отбитый угол у ног
    p.append(sphere(0.07, (-0.12, -0.06, 0.6), (1.2, 0.35, 0.9), 6, 4, "Moss"))
    weeds(p, 6, 0.28, 122)
    join(p, "TombstoneB")
    export("tombstone_b")


def monument():
    """Ступенчатый памятник: три ступени, высокая плита с аркой, карниз и крест."""
    reset()
    random.seed(123)
    p = []
    for k, (w, d) in enumerate(((0.78, 0.6), (0.62, 0.46), (0.48, 0.34))):
        p.append(box((w, d, 0.1), (0, 0, 0.05 + k * 0.1), mat="StoneDark" if k % 2 == 0 else "Stone", bev=0.012))
    p += arch_slab(0.36, 0.72, 0.18, (0, 0, 0.3), "Stone", shoulder=0.05)
    p.append(box((0.44, 0.24, 0.05), (0, 0, 0.84), mat="StoneDark"))
    p.append(box((0.05, 0.06, 0.24), (0, 0, 1.17), mat="Stone"))
    p.append(box((0.16, 0.06, 0.05), (0, 0, 1.22), mat="Stone"))
    p.append(box((0.24, 0.02, 0.28), (0, -0.095, 0.56), mat="StoneDark", bev=0.004))  # табличка
    for z in (0.64, 0.58, 0.52):
        p.append(box((0.16, 0.012, 0.012), (0, -0.108, z), mat="Shadow"))
    p.append(sphere(0.1, (0.22, -0.2, 0.22), (1.4, 1, 0.4), 8, 5, "Moss"))
    weeds(p, 6, 0.42, 123)
    join(p, "Monument")
    export("monument")


def wood_cross():
    """Покосившийся деревянный крест из грубых досок, перевязан верёвкой, холмик земли."""
    reset()
    random.seed(124)
    cross = [box((0.07, 0.05, 0.7), (0, 0, 0.3), mat="WoodDark"), box((0.36, 0.05, 0.07), (0.02, 0, 0.5), (0, 0.12, 0), mat="WoodDark"),
             box((0.09, 0.07, 0.09), (0, 0, 0.5), mat="Rope"), box((0.1, 0.03, 0.12), (0, -0.03, 0.35), mat="Wood")]
    c = join(cross, "Cross")
    c.rotation_euler = (0.1, -0.28, 0)
    p = [c, sphere(0.26, (0, 0.2, 0), (1, 1.6, 0.25), 10, 5, "Dirt")]
    weeds(p, 4, 0.3, 124)
    join(p, "WoodCross")
    export("wood_cross")


def iron_gate():
    """Кованые кладбищенские ворота: каменные столбы, две створки с пиками, над ними дуга с крестом."""
    reset()
    random.seed(125)
    p = []
    for s in (-1, 1):
        p.append(box((0.32, 0.32, 1.9), (s * 1.05, 0, 0.95), mat="StoneDark"))
        p.append(box((0.4, 0.4, 0.1), (s * 1.05, 0, 1.95), mat="Stone"))
        p.append(sphere(0.12, (s * 1.05, 0, 2.08), seg=10, rings=6, mat="Stone"))
    for s in (-1, 1):  # створки, правая приоткрыта
        rot = 0.0 if s < 0 else 0.35
        leaf = []
        for k in range(8):
            x = s * (0.1 + k * 0.11)
            top = 1.55 + math.cos((k / 7) * math.pi * 0.5) * 0.35  # к середине выше — дуга
            leaf.append(limb((x, 0, 0.05), (x, 0, top), 0.014, 0.014, 5, "SteelDark"))
            leaf.append(cone(0.035, 0.0, 0.1, (x, 0, top + 0.04), 4, "SteelDark"))
        for z in (0.35, 1.0):
            leaf.append(box((0.84, 0.03, 0.03), (s * 0.48, 0, z), mat="SteelDark"))
        for k in range(3):
            leaf.append(torus(0.08, 0.01, (s * (0.25 + k * 0.23), 0, 0.68), (math.pi / 2, 0, 0), 12, mat="SteelDark"))
        g = join(leaf, "Leaf")
        if rot:
            set_origin(g, (s * 0.9, 0, 0))
            g.rotation_euler = (0, 0, rot)
        p.append(g)
    p += curve_limb([(-0.9, 0, 1.95), (-0.4, 0, 2.25), (0, 0, 2.32), (0.4, 0, 2.25), (0.9, 0, 1.95)], 0.02, 0.02, 5, "SteelDark")
    p.append(box((0.04, 0.04, 0.3), (0, 0, 2.45), mat="SteelDark"))
    p.append(box((0.18, 0.04, 0.04), (0, 0, 2.5), mat="SteelDark"))
    join(p, "IronGate")
    export("iron_gate")


def dead_tree():
    """Голое кривое дерево с раскинутыми когтистыми ветвями."""
    reset()
    join(grow_tree(131, 2.6, 1.5, 4, 0.16, droop=0.22), "DeadTree")
    export("dead_tree")


def dead_tree_b():
    """Высокое тонкое дерево: ветви задраны вверх, как пальцы."""
    reset()
    join(grow_tree(142, 3.4, 0.6, 4, 0.13, droop=-0.1), "DeadTreeB")
    export("dead_tree_b")


def dead_tree_c():
    """Сухое дерево с дуплом и обломанной верхушкой: толстый короткий ствол, пара кривых ветвей."""
    reset()
    random.seed(143)
    p = grow_tree(143, 1.6, 1.6, 2, 0.22, droop=0.35, verts=8)
    p.append(sphere(0.07, (0.0, -0.2, 0.45), (1, 0.4, 1.5), 8, 5, "Shadow"))  # дупло
    for k in range(5):  # щепа на изломе верхушки
        a = k / 5 * math.tau
        p.append(cone(0.05, 0.0, 0.18, (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.95), 4, "Bark", rot=(math.cos(a) * 0.3, math.sin(a) * 0.3, 0)))
    join(p, "DeadTreeC")
    export("dead_tree_c")


def ghost():
    """Призрак-простыня: купол головы, балахон расширяется книзу, подол волнами,
    руки — свисающие лоскуты простыни, большие тёмные глаза и улыбка.
    Смотрит в -Y (в игре +Z), низ подола около z = 0. В игре — полупрозрачный,
    со светящейся кромкой (MAT.ghost)."""
    reset()
    segs = 28
    rings = []
    for k in range(9):  # балахон: от подола вверх
        z = 0.05 + k * 0.07
        rings.append((z, 0.35 - (0.35 - 0.23) * min(1, z / 0.6)))
    for k in range(1, 7):  # купол головы
        a = k / 7 * math.pi / 2
        rings.append((0.61 + math.sin(a) * 0.25, math.cos(a) * 0.23))
    bm = bmesh.new()
    grid = []
    for ri, (z, r) in enumerate(rings):
        row = []
        for j in range(segs):
            ang = j / segs * math.tau
            zz, rr = z, r
            if ri == 0:  # волнистый подол, лоскуты расходятся наружу
                zz += 0.06 * math.sin(ang * 5) - 0.02
                rr += 0.04 * max(0.0, math.sin(ang * 5))
            row.append(bm.verts.new((math.cos(ang) * rr, math.sin(ang) * rr, zz)))
        grid.append(row)
    for ri in range(len(grid) - 1):
        for j in range(segs):
            bm.faces.new((grid[ri][j], grid[ri][(j + 1) % segs], grid[ri + 1][(j + 1) % segs], grid[ri + 1][j]))
    top = bm.verts.new((0, 0, 0.87))
    for j in range(segs):
        bm.faces.new((grid[-1][j], grid[-1][(j + 1) % segs], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("GhostBody")
    bm.to_mesh(me)
    bm.free()
    body = bpy.data.objects.new("GhostBody", me)
    bpy.context.collection.objects.link(body)
    p = [M(body, "Ghost")]
    for s in (-1, 1):  # руки-лоскуты: разведены в стороны и свисают
        arm = sphere(0.14, (s * 0.3, 0.02, 0.5), (1.9, 0.22, 0.5), 16, 8, "Ghost")  # тонкий лоскут от плеча
        arm.rotation_euler = (0, s * 0.35, 0)
        p.append(arm)
        tip = sphere(0.07, (s * 0.5, 0.02, 0.36), (0.8, 0.22, 1.3), 10, 6, "Ghost")  # свисающий угол простыни
        tip.rotation_euler = (0, -s * 0.3, 0)
        p.append(tip)
    join(p, "Ghost", smooth=True)
    face = []
    for s in (-1, 1):  # большие овальные глаза чуть над поверхностью — не тонут в дымке
        face.append(sphere(0.055, (s * 0.075, -0.225, 0.64), (0.75, 0.35, 1.25), 12, 8, "Shadow"))
    mouth = torus(0.045, 0.012, (0, -0.24, 0.5), (math.pi / 2, 0, 0), 12, mat="Shadow")
    for v in mouth.data.vertices:  # оставить нижнюю половину кольца — улыбка
        if v.co.y > 0.005:
            v.co.y = 0.005
    face.append(mouth)
    join(face, "GhostFace", smooth=True)
    export("ghost")


def skull_proj():
    """Череп-снаряд: свод, надбровья, глазницы, нос, скулы, верхняя челюсть с зубами,
    нижняя челюсть, трещина. Центр в нуле."""
    reset()
    random.seed(127)
    p = []
    cr = sphere(0.1, (0, 0.01, 0.02), (0.92, 1.05, 0.95), 14, 9, "Bone")
    jitter(cr, 0.004, 8, 127)
    p.append(cr)
    p.append(box((0.14, 0.05, 0.03), (0, -0.08, 0.035), mat="Bone", bev=0.012))  # надбровья
    for s in (-1, 1):
        p.append(sphere(0.034, (s * 0.04, -0.092, 0.0), (1, 0.6, 1.05), 8, 5, "Shadow"))  # глазницы
        p.append(sphere(0.022, (s * 0.07, -0.06, -0.035), (1, 1, 0.7), 6, 4, "Bone"))       # скулы
    p.append(cone(0.013, 0.0, 0.035, (0, -0.1, -0.035), 3, "Shadow", rot=(math.pi, 0, 0)))  # нос
    p.append(box((0.1, 0.06, 0.04), (0, -0.06, -0.07), mat="Bone", bev=0.01))               # верхняя челюсть
    for k in range(6):
        p.append(box((0.012, 0.012, 0.018), (-0.03 + k * 0.012, -0.092, -0.085), mat="Bone", bev=0.002))
    p.append(box((0.09, 0.07, 0.025), (0, -0.045, -0.1), (0.25, 0, 0), mat="Bone", bev=0.008))  # нижняя челюсть
    p.append(box((0.006, 0.05, 0.004), (0.03, -0.02, 0.1), (0.2, 0, 0.5), mat="Shadow", bev=0.001))  # трещина
    join(p, "SkullProj")
    export("skull_proj")


def bones():
    """Кости на земле: две скрещённые длинные, рёбра, мелкие обломки."""
    reset()
    random.seed(128)
    p = []
    for a in (0.5, -0.6):
        d = V((math.cos(a), math.sin(a), 0))
        p.append(limb(-d * 0.18 + V((0, 0, 0.02)), d * 0.18 + V((0, 0, 0.02)), 0.016, 0.016, 6, "Bone"))
        for e in (-1, 1):
            for off in (-0.012, 0.012):
                p.append(sphere(0.022, d * 0.19 * e + V((-d.y * off, d.x * off, 0.02)), seg=6, rings=4, mat="Bone"))
    for k in range(3):  # рёбра дугой
        p += curve_limb([(0.15, -0.1 + k * 0.05, 0.01), (0.22, -0.08 + k * 0.05, 0.05), (0.28, -0.1 + k * 0.05, 0.01)], 0.007, 0.005, 4, "Bone")
    join(p, "Bones")
    export("bones")


def flowers():
    """Увядший букет: сухие стебли, тёмно-красные поникшие бутоны, перевязь лентой."""
    reset()
    random.seed(129)
    p = []
    for k in range(7):
        a = random.uniform(-0.6, 0.6)
        tip = V((math.sin(a) * 0.12, random.uniform(-0.05, 0.05), 0.02 + random.uniform(0.0, 0.04)))
        base = V((-0.2, 0, 0.02))
        mid = base.lerp(tip, 0.5) + V((0, 0, 0.03))
        p += curve_limb([base, mid, tip + V((0.2, 0, 0))], 0.006, 0.004, 4, "Reed")
        p.append(sphere(0.025, tip + V((0.21, 0, 0)), (1, 1, 0.8), 6, 4, "CapRed" if k % 3 else "Berry"))
    p.append(torus(0.025, 0.008, (-0.1, 0, 0.03), (0, math.pi / 2, 0), 8, mat="Cloak"))
    join(p, "Flowers")
    export("flowers")



def spoked_wheel(r, center, name):
    """Колесо со спицами — отдельный объект с центром в ступице (игра крутит вокруг X)."""
    c = V(center)
    w = [torus(r, 0.022, c, (0, math.pi / 2, 0), 20, mat="WoodDark"), torus(r + 0.012, 0.012, c, (0, math.pi / 2, 0), 20, mat="SteelDark"),
         cyl(0.045, 0.08, c, (0, math.pi / 2, 0), 10, "SteelDark")]
    for k in range(8):
        a = k / 8 * math.tau
        w.append(limb(c, c + V((0, math.cos(a) * r, math.sin(a) * r)), 0.012, 0.01, 4, "WoodDark"))
    o = join(w, name)
    set_origin(o, c)
    return o


def hearse():
    """Катафалк без лошадей: чёрный кузов на рессорах, стойки и рамы окон, внутри гроб,
    крыша с плюмажами и урнами, два фонаря с огоньками спереди, пустые козлы.
    Смотрит в -Y (в игре +Z), колёса — объекты Wheel0..Wheel3."""
    reset()
    random.seed(151)
    p = [box((0.6, 1.3, 0.06), (0, 0.05, 0.4), mat="WoodDark"), box((0.62, 1.12, 0.05), (0, 0.1, 0.44), mat="Coal")]
    for x in (-0.28, 0.28):  # стойки кузова
        for y in (-0.44, 0.1, 0.64):
            p.append(box((0.05, 0.05, 0.56), (x, y, 0.72), mat="Coal"))
        p.append(box((0.05, 1.14, 0.05), (x, 0.1, 0.98), mat="Coal"))
        p.append(box((0.05, 1.14, 0.08), (x, 0.1, 0.5), mat="Coal"))
        for y in (-0.17, 0.37):  # резной узор в окне
            p.append(torus(0.06, 0.008, (x, y, 0.93), (0, math.pi / 2, 0), 10, mat="Brass"))
    p.append(box((0.6, 0.05, 0.56), (0, 0.66, 0.72), mat="Coal"))  # задняя стенка
    # гроб внутри
    p.append(box((0.32, 0.95, 0.16), (0, 0.12, 0.55), mat="Wood", bev=0.02))
    p.append(box((0.34, 0.97, 0.03), (0, 0.12, 0.64), mat="WoodDark"))
    p.append(box((0.04, 0.3, 0.012), (0, 0.05, 0.66), mat="Brass"))
    p.append(box((0.16, 0.04, 0.012), (0, -0.02, 0.66), mat="Brass"))
    # крыша, плюмажи, урны
    p.append(box((0.72, 1.28, 0.06), (0, 0.1, 1.04), mat="Coal"))
    p.append(box((0.6, 1.1, 0.05), (0, 0.1, 1.09), mat="Coal"))
    for x in (-0.3, 0.3):
        for y in (-0.48, 0.68):
            p.append(cyl(0.035, 0.08, (x, y, 1.12), verts=8, mat="Brass"))
            p.append(cone(0.07, 0.01, 0.26, (x, y, 1.29), 7, "Cloak"))  # чёрный плюмаж
    p.append(box((0.04, 0.04, 0.22), (0, 0.1, 1.22), mat="Brass"))
    p.append(box((0.14, 0.04, 0.04), (0, 0.1, 1.27), mat="Brass"))
    # козлы и фонари
    p.append(box((0.5, 0.2, 0.05), (0, -0.62, 0.66), mat="WoodDark"))
    p.append(box((0.5, 0.05, 0.2), (0, -0.52, 0.74), mat="Coal"))
    p.append(box((0.05, 0.4, 0.05), (0, -0.85, 0.42), (0.35, 0, 0), mat="WoodDark"))  # дышло
    flames = []
    for x in (-0.33, 0.33):
        p.append(box((0.08, 0.08, 0.12), (x, -0.5, 0.92), mat="SteelDark"))
        p.append(cone(0.06, 0.0, 0.06, (x, -0.5, 1.01), 4, "SteelDark"))
        flames.append(box((0.05, 0.05, 0.08), (x, -0.5, 0.92), mat="Flame", bev=0.004))
    for x in (-0.24, 0.24):  # рессоры
        p += curve_limb([(x, -0.55, 0.37), (x, -0.4, 0.3), (x, -0.25, 0.37)], 0.015, 0.015, 4, "SteelDark")
        p += curve_limb([(x, 0.3, 0.37), (x, 0.47, 0.3), (x, 0.64, 0.37)], 0.015, 0.015, 4, "SteelDark")
    join(p, "Hearse")
    join(flames, "HearseLamp")
    for k, (x, y, r) in enumerate(((-0.36, -0.42, 0.21), (0.36, -0.42, 0.21), (-0.36, 0.5, 0.28), (0.36, 0.5, 0.28))):
        spoked_wheel(r, (x, y, r), f"Wheel{k}")
    export("hearse")


def gate_leaf():
    """Створка кованых ворот: петля в x = 0, створка вдоль +X на 0,46; прутья с пиками,
    перекладины, завитки. Игра поворачивает её вокруг петли."""
    reset()
    p = []
    for k in range(5):
        x = 0.04 + k * 0.095
        top = 0.86 + (k / 4) * 0.08
        p.append(limb((x, 0, 0.04), (x, 0, top), 0.012, 0.012, 5, "SteelDark"))
        p.append(cone(0.03, 0.0, 0.08, (x, 0, top + 0.035), 4, "SteelDark"))
    for z in (0.12, 0.45, 0.8):
        p.append(box((0.46, 0.025, 0.025), (0.23, 0, z), mat="SteelDark"))
    p.append(box((0.03, 0.03, 0.88), (0.015, 0, 0.46), mat="SteelDark"))
    for k in range(2):
        p.append(torus(0.06, 0.008, (0.14 + k * 0.19, 0, 0.62), (math.pi / 2, 0, 0), 10, mat="SteelDark"))
    p.append(torus(0.04, 0.01, (0.43, -0.02, 0.45), (math.pi / 2, 0, 0), 8, mat="Rust"))  # кольцо-ручка
    join(p, "GateLeaf")
    export("gate_leaf")


def gate_post():
    """Каменный столб ворот с шаром."""
    reset()
    p = [box((0.16, 0.16, 1.05), (0, 0, 0.52), mat="StoneDark"), box((0.2, 0.2, 0.06), (0, 0, 1.07), mat="Stone"),
         sphere(0.07, (0, 0, 1.15), seg=10, rings=6, mat="Stone"), sphere(0.06, (0.05, -0.06, 0.2), (1, 0.6, 1), 6, 4, "Moss")]
    join(p, "GatePost")
    export("gate_post")



def grave_slab():
    """Плоская могильная плита вровень с землёй: крест и строки, трещина, мох по краю."""
    reset()
    random.seed(161)
    p = [box((0.42, 0.66, 0.035), (0, 0, 0.017), mat="Stone", bev=0.01)]
    p.append(box((0.04, 0.26, 0.006), (0, 0.12, 0.036), mat="StoneDark"))
    p.append(box((0.16, 0.04, 0.006), (0, 0.18, 0.036), mat="StoneDark"))
    for y in (-0.08, -0.14, -0.2):
        p.append(box((random.uniform(0.18, 0.26), 0.014, 0.006), (0, y, 0.036), mat="StoneDark"))
    p.append(box((0.3, 0.008, 0.006), (0.02, -0.02, 0.037), (0, 0, 0.6), mat="Shadow"))
    p.append(sphere(0.08, (0.17, 0.28, 0.02), (1.2, 1.6, 0.25), 8, 4, "Moss"))
    join(p, "GraveSlab")
    export("grave_slab")


def leaf_pile():
    """Кучка опавших сухих листьев."""
    reset()
    random.seed(162)
    p = []
    for k in range(14):
        a = random.uniform(0, math.tau)
        rr = random.uniform(0, 0.16)
        lf = box((0.07, 0.045, 0.006), (math.cos(a) * rr, math.sin(a) * rr, 0.006 + random.uniform(0, 0.02)),
                 (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), random.uniform(0, 3)),
                 mat=random.choice(("Wood", "Rust", "Reed", "WoodDark")), bev=0.001)
        p.append(lf)
    join(p, "LeafPile")
    export("leaf_pile")


def small_cross():
    """Маленький деревянный крестик, воткнутый в землю, чуть покосился."""
    reset()
    c = join([box((0.035, 0.03, 0.34), (0, 0, 0.15), mat="WoodDark"), box((0.16, 0.03, 0.035), (0, 0, 0.24), mat="WoodDark"),
              box((0.045, 0.04, 0.045), (0, 0, 0.24), mat="Rope")], "SmallCross")
    c.rotation_euler = (0.12, 0.15, 0)
    join([c, sphere(0.08, (0, 0.02, 0), (1, 1.3, 0.3), 8, 4, "Dirt")], "SmallCrossMound")
    export("small_cross")


PALETTE.update({"Ghost2": "#9fb6c2", "Ghost3": "#6f8792", "Berry": "#8e2230", "Brass": "#a07a3a", "SwampMoss": "#5d6a33"})
for build in (tombstone, tombstone_b, monument, wood_cross, iron_gate, dead_tree, dead_tree_b, dead_tree_c, celtic_cross, iron_fence, fresh_grave, crypt,
              candles, skull_proj, bones, flowers, zombie_hand, hand_mound, hearse, gate_leaf, gate_post, grave_slab, leaf_pile, small_cross):  # призрак — blender/import_ghost.py
    build()
boat(2, 110)
boat(3, 111)
preview(["tombstone", "tombstone_b", "monument", "wood_cross", "iron_gate", "dead_tree", "dead_tree_b", "dead_tree_c", "ghost", "skull_proj", "bones", "flowers",
         "zombie_hand", "hand_mound", "hearse", "gate_leaf", "gate_post"], os.path.join(ROOT, "docs", "cemetery.png"))
