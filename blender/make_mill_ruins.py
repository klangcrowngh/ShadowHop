"""Окружение лесопилки и руин.

Запуск:  "D:\\blender\\blender.exe" -b -P blender/make_mill_ruins.py

Отдельно от make_models.py (тот пересобирает все модели, включая героя).
Листва плюща — те же функции, что в make_veg.py.

Лесопилка: log_stack (штабель брёвен), sawhorse (козлы с бревном и лучковой пилой),
  chop_block (колода с топором и поленьями), wheelbarrow (тачка с досками),
  sawdust (куча опилок), log_crane (деревянный журавль с бревном на тросе).
Руины: column_fallen (упавшая колонна), statue (безголовая статуя), graves (надгробия),
  ivy_wall (обломок стены в плюще), arch (одинокая арка), drum (барабан колонны —
  катится по мощёной дороге: центр в нуле, ось вдоль Y Blender, как у rolllog).
Превью: docs/mill_decor.png, docs/ruins_decor.png.
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
veg = open(os.path.join(HERE, "make_veg.py"), encoding="utf-8").read()
veg = veg[veg.index("def leaf_mesh("):veg.index("def stems(")]
exec(compile(veg, "make_veg_foliage", "exec"))

PALETTE.update({"LeafLight": "#5b7f45", "Sawn": "#b48e62", "Sawdust": "#9c8058", "Marble": "#8b8a84"})


def sawn_end(parts, center, r, axis, sign):
    """Свежий срез бревна: светлый торец и годичные кольца. axis — 'x' или 'y'."""
    rot = (0, math.pi / 2, 0) if axis == "x" else (math.pi / 2, 0, 0)
    off = V((sign * 0.012, 0, 0)) if axis == "x" else V((0, sign * 0.012, 0))
    c = V(center)
    parts.append(cyl(r * 0.92, 0.02, c, rot, 12, "Sawn"))
    for k in (0.35, 0.65):
        parts.append(torus(r * k, r * 0.05, c + off, rot, 12, mat="Wood"))


def log_x(parts, x0, x1, y, z, r, seed):
    """Бревно вдоль X с корой и срезами на торцах."""
    random.seed(seed)
    L = x1 - x0
    o = cyl(r, L, ((x0 + x1) / 2, y, z), (0, math.pi / 2, 0), 10, "Bark")
    jitter(o, r * 0.08, 5, seed)
    parts.append(o)
    sawn_end(parts, (x0, y, z), r, "x", -1)
    sawn_end(parts, (x1, y, z), r, "x", 1)


# =============================================================================
# Лесопилка
# =============================================================================

def log_stack():
    """Штабель брёвен пирамидой, по бокам — вбитые колья, чтобы не раскатились."""
    reset()
    random.seed(81)
    p = []
    r = 0.13
    for layer, n in enumerate((4, 3, 2)):
        for k in range(n):
            y = (k - (n - 1) / 2) * r * 2.02
            z = r + layer * r * 1.72
            dx = random.uniform(-0.06, 0.06)
            log_x(p, -0.5 + dx, 0.5 + dx + random.uniform(-0.04, 0.04), y, z, r * random.uniform(0.92, 1.05), 81 + layer * 5 + k)
    for s in (-1, 1):
        for x in (-0.3, 0.3):
            p.append(box((0.06, 0.06, 0.5), (x, s * 0.56, 0.25), (s * 0.12, 0, 0), mat="WoodDark"))
    p.append(sphere(0.1, (0.1, -0.1, 0.62), (1.6, 1.2, 0.35), 8, 5, "Moss"))
    join(p, "LogStack")
    export("log_stack")


def sawhorse():
    """Козлы: две X-опоры, на них бревно; в распиле застряла лучковая пила."""
    reset()
    p = []
    for x in (-0.36, 0.36):
        for s in (-1, 1):
            p.append(box((0.06, 0.06, 0.7), (x, 0, 0.3), (s * 0.5, 0, 0), mat="WoodDark"))
        p.append(box((0.05, 0.4, 0.05), (x, 0, 0.14), mat="WoodDark"))
    p.append(box((0.8, 0.05, 0.05), (0, 0, 0.14), mat="WoodDark"))
    log_x(p, -0.52, 0.52, 0, 0.6, 0.12, 82)
    # лучковая пила: полотно поперёк бревна ушло в распил, над ним Н-рама с закруткой
    x = 0.12
    p.append(box((0.006, 0.5, 0.06), (x, 0.0, 0.6), mat="Steel", bev=0.002))
    for y in (-0.25, 0.25):
        p.append(box((0.03, 0.03, 0.42), (x, y, 0.76), mat="Wood"))
    p.append(box((0.025, 0.5, 0.025), (x, 0, 0.8), mat="Wood"))
    p.append(limb((x, -0.25, 0.96), (x, 0.25, 0.96), 0.008, 0.008, 4, "Rope"))
    p.append(box((0.012, 0.012, 0.12), (x, 0.0, 0.9), mat="WoodDark"))
    p.append(box((0.14, 0.14, 0.01), (0.2, 0.12, 0.005), mat="Sawdust"))  # опилки под распилом
    p.append(sphere(0.12, (0.12, 0.05, 0.0), (1.4, 1.0, 0.2), 8, 4, "Sawdust"))
    join(p, "Sawhorse")
    export("sawhorse")


def chop_block():
    """Колода для колки: широкий пень, в нём топор; рядом поленья и щепа."""
    reset()
    random.seed(83)
    o = cyl(0.26, 0.4, (0, 0, 0.2), verts=12, mat="Bark")
    jitter(o, 0.02, 5, 83)
    p = [o]
    p.append(cyl(0.24, 0.02, (0, 0, 0.4), verts=12, mat="Sawn"))  # срез с кольцами
    for k in (0.09, 0.16):
        p.append(torus(k, 0.012, (0, 0, 0.412), seg=12, mat="Wood"))
    # топор: лезвие в колоде, топорище наискосок
    head = (0.04, 0.0, 0.43)
    p.append(box((0.16, 0.035, 0.12), head, (0, 0.5, 0), mat="Steel"))
    p.append(limb((0.06, 0, 0.44), (0.36, 0.05, 0.78), 0.022, 0.018, 6, "Wood"))
    for k in range(5):  # поленья: четвертинки бревна
        a = random.uniform(0, math.tau)
        d = V((math.cos(a), math.sin(a), 0))
        c = d * random.uniform(0.36, 0.46)
        q = box((0.28, 0.1, 0.1), c + V((0, 0, 0.05 + (0.1 if k == 4 else 0))), (0, 0, a + random.uniform(-0.5, 0.5)),
                mat="Sawn" if k % 2 else "Wood", bev=0.015)
        p.append(q)
    for k in range(10):  # щепа
        a = random.uniform(0, math.tau)
        p.append(box((0.06, 0.02, 0.006), (math.cos(a) * random.uniform(0.28, 0.5), math.sin(a) * random.uniform(0.28, 0.5), 0.004),
                     (0, 0, random.uniform(0, 3)), mat="Sawn", bev=0.001))
    join(p, "ChopBlock")
    export("chop_block")


def wheelbarrow():
    """Деревянная тачка с досками: короб, колесо спереди, ручки и упоры сзади."""
    reset()
    p = []
    z = 0.32
    p.append(box((0.62, 0.42, 0.04), (0, 0, z), mat="WoodDark"))
    for s in (-1, 1):
        p.append(box((0.66, 0.035, 0.2), (0, s * 0.22, z + 0.1), (s * 0.18, 0, 0), mat="Wood"))
        p.append(box((0.035, 0.46, 0.2), (s * 0.33, 0, z + 0.1), (0, -s * 0.2, 0), mat="Wood"))
        p.append(box((0.9, 0.04, 0.04), (-0.12, s * 0.16, z - 0.04), mat="WoodDark"))  # оглобли-ручки
        p.append(box((0.04, 0.04, 0.3), (-0.3, s * 0.16, 0.15), mat="WoodDark"))  # упоры
    p.append(cyl(0.16, 0.05, (0.44, 0, 0.16), (math.pi / 2, 0, 0), 14, "WoodDark"))  # колесо
    p.append(torus(0.16, 0.02, (0.44, 0, 0.16), (math.pi / 2, 0, 0), 16, mat="SteelDark"))
    p.append(cyl(0.02, 0.36, (0.44, 0, 0.16), (math.pi / 2, 0, 0), 6, "SteelDark"))
    for k in range(4):  # доски горкой, торчат назад
        p.append(box((0.8, 0.12, 0.03), (-0.05, -0.12 + k * 0.08, z + 0.1 + k * 0.035), (0, -0.05, 0.05 * (k - 1.5)),
                     mat="Sawn" if k % 2 else "Wood"))
    join(p, "Wheelbarrow")
    export("wheelbarrow")


def sawdust():
    """Куча опилок: пологий холмик, щепа и обрезки досок."""
    reset()
    random.seed(85)
    p = []
    mound = sphere(0.36, (0, 0, 0), (1.3, 1.0, 0.38), 12, 7, "Sawdust")
    jitter(mound, 0.03, 4, 85)
    p.append(mound)
    p.append(sphere(0.2, (0.36, 0.18, 0), (1.2, 1, 0.3), 8, 5, "Sawn"))
    for k in range(8):
        a = random.uniform(0, math.tau)
        rr = random.uniform(0.35, 0.6)
        p.append(box((random.uniform(0.05, 0.1), 0.025, 0.008), (math.cos(a) * rr, math.sin(a) * rr, 0.005), (0, 0, random.uniform(0, 3)),
                     mat="Sawn", bev=0.001))
    p.append(box((0.4, 0.08, 0.025), (-0.25, -0.3, 0.02), (0.1, 0, 0.5), mat="Wood"))
    join(p, "Sawdust")
    export("sawdust")


def log_crane():
    """Деревянный журавль: столб на растяжках, наклонная стрела, трос и висящее бревно."""
    reset()
    p = [box((0.6, 0.6, 0.2), (0, 0, 0.1), mat="StoneDark"), box((0.16, 0.16, 2.4), (0, 0, 1.3), mat="WoodDark")]
    for a in (0.6, 2.7, 4.6):  # подкосы
        d = V((math.cos(a), math.sin(a), 0))
        p.append(limb(d * 0.55, V((0, 0, 0.9)), 0.04, 0.035, 5, "WoodDark"))
    top = V((0, 0, 2.3))
    tip = V((1.1, 0, 2.6))
    p.append(limb(V((-0.4, 0, 2.1)), tip, 0.06, 0.05, 6, "Wood"))  # стрела
    p.append(limb(V((0, 0, 2.5)), tip, 0.012, 0.012, 3, "Rope"))
    p.append(box((0.3, 0.3, 0.3), (-0.5, 0, 2.0), mat="StoneDark"))  # противовес
    p.append(cyl(0.08, 0.1, (0.05, 0, 1.2), (math.pi / 2, 0, 0), 10, "SteelDark"))  # ворот
    p.append(limb(tip, V((1.1, 0, 1.25)), 0.012, 0.012, 3, "Rope"))
    p.append(limb(V((1.1, 0, 1.25)), V((0.85, 0, 1.12)), 0.01, 0.01, 3, "SteelDark"))
    p.append(limb(V((1.1, 0, 1.25)), V((1.35, 0, 1.12)), 0.01, 0.01, 3, "SteelDark"))
    log_x(p, 0.55, 1.65, 0, 1.0, 0.13, 86)
    join(p, "LogCrane")
    export("log_crane")


# =============================================================================
# Руины
# =============================================================================

def fluted(r, length, loc, rot, mat, flutes=16, depth=0.08):
    """Каннелированный цилиндр — барабан колонны."""
    o = cyl(r, length, loc, rot, flutes * 2, mat)
    for v in o.data.vertices:
        ang = math.atan2(v.co.y, v.co.x)
        if math.hypot(v.co.x, v.co.y) > r * 0.5 and round(ang / (math.tau / (flutes * 2))) % 2:
            v.co.x *= 1 - depth
            v.co.y *= 1 - depth
    return o


def chip(o, seed, n=3, amount=0.05):
    """Отбитые края: несколько вершин вдавлены внутрь."""
    random.seed(seed)
    vs = list(o.data.vertices)
    for v in random.sample(vs, min(n * 3, len(vs))):
        v.co *= 1 - random.uniform(0, amount)


def column_fallen():
    """Упавшая колонна: три барабана раскатились в линию, капитель лежит отдельно, мох."""
    reset()
    random.seed(91)
    p = []
    r = 0.2
    for k, x in enumerate((-0.42, -0.04, 0.34)):
        o = fluted(r, 0.36, (x, random.uniform(-0.05, 0.05), r), (0, math.pi / 2, random.uniform(-0.2, 0.2)), "Marble")
        chip(o, 91 + k)
        p.append(o)
    p.append(box((0.42, 0.42, 0.12), (0.72, 0.12, 0.06), (0, 0, 0.4), mat="StoneDark"))  # капитель
    p.append(cyl(0.2, 0.1, (0.72, 0.12, 0.17), verts=16, mat="Marble"))
    for x, y in ((-0.2, 0.18), (0.2, -0.18)):
        p.append(sphere(0.1, (x, y, 0.3), (1.5, 1.0, 0.4), 8, 5, "Moss"))
    for k in range(6):
        p.append(box((0.08, 0.06, 0.05), (random.uniform(-0.6, 0.8), random.choice((-0.28, 0.28)), 0.025), (0.3, 0.2, random.uniform(0, 3)),
                     mat="Stone", bev=0.01))
    join(p, "ColumnFallen")
    export("column_fallen")


def statue():
    """Безголовый ангел на пьедестале: длинное одеяние, руки сложены на мече,
    крылья за спиной (одно обломано), трещина, мох."""
    reset()
    random.seed(92)
    p = [box((0.5, 0.5, 0.28), (0, 0, 0.14), mat="StoneDark"), box((0.42, 0.42, 0.06), (0, 0, 0.31), mat="Stone")]
    p.append(cone(0.17, 0.12, 0.62, (0, 0, 0.65), 10, "Marble"))  # одеяние
    p.append(sphere(0.13, (0, 0, 1.0), (1.25, 0.8, 1.1), 10, 6, "Marble"))  # грудь и плечи
    p.append(cyl(0.045, 0.06, (0, 0, 1.15), verts=8, mat="Marble"))  # обломок шеи
    for s in (-1, 1):  # руки сходятся к рукояти меча
        p += curve_limb([(s * 0.15, 0, 1.06), (s * 0.17, -0.06, 0.88), (s * 0.03, -0.14, 0.8)], 0.04, 0.032, 6, "Marble")
    p.append(box((0.03, 0.02, 0.5), (0, -0.16, 0.56), mat="Marble"))   # клинок остриём вниз
    p.append(box((0.18, 0.03, 0.03), (0, -0.16, 0.8), mat="Marble"))   # гарда
    p.append(sphere(0.03, (0, -0.15, 0.86), seg=6, rings=4, mat="Marble"))
    for s, n in ((-1, 6), (1, 3)):  # крылья: перья веером, правое обломано
        for k in range(n):
            a = 0.25 + k * 0.2
            ln = 0.55 - k * 0.05
            c = V((s * (0.1 + math.sin(a) * ln * 0.5), 0.1, 1.0 + math.cos(a) * ln * 0.5 - 0.08))
            p.append(box((0.07, 0.03, ln), c, (0, s * a, 0), mat="Marble", bev=0.01))
    p.append(box((0.008, 0.16, 0.3), (0.12, -0.02, 0.6), (0, 0, 0.3), mat="StoneDark", bev=0.001))  # трещина
    p.append(sphere(0.12, (0.13, 0.14, 0.34), (1.4, 1.2, 0.35), 8, 5, "Moss"))
    p.append(sphere(0.08, (-0.14, 0.02, 1.08), (1, 1, 0.4), 8, 5, "Moss"))
    p.append(box((0.14, 0.05, 0.1), (0.3, -0.32, 0.04), (0.2, 0.3, 0.5), mat="Marble"))  # обломок крыла у ног
    join(p, "Statue")
    export("statue")


def graves():
    """Надгробия: покосившиеся плиты с полукруглым верхом, каменный крест, трава и мох."""
    reset()
    random.seed(93)
    p = []
    for k, (x, y, h, w, t) in enumerate(((-0.28, 0.05, 0.5, 0.26, -0.12), (0.05, -0.1, 0.4, 0.22, 0.18), (0.3, 0.12, 0.34, 0.2, 0.05))):
        m = "Stone" if k != 1 else "StoneDark"
        slab = box((w, 0.08, h), (0, 0, h / 2), mat=m, bev=0.015)
        cap = cyl(w / 2, 0.08, (0, 0, h), (math.pi / 2, 0, 0), 12, m)
        tomb = join([slab, cap], f"Tomb{k}")  # плита с полукруглым верхом, затем покосить
        tomb.location = (x, y, -0.03)
        tomb.rotation_euler = (t, 0, random.uniform(-0.25, 0.25))
        p.append(tomb)
    # крест
    p.append(box((0.07, 0.07, 0.62), (0.05, 0.3, 0.3), (0, 0.1, 0), mat="StoneDark"))
    p.append(box((0.3, 0.07, 0.07), (0.07, 0.3, 0.46), (0, 0.1, 0), mat="StoneDark"))
    for k in range(9):  # пучки травы у плит
        x, y = random.uniform(-0.4, 0.4), random.uniform(-0.3, 0.1)
        for j in range(3):
            a = random.uniform(0, math.tau)
            p.append(limb((x, y, 0), (x + math.cos(a) * 0.04, y + math.sin(a) * 0.04, random.uniform(0.07, 0.12)), 0.012, 0.002, 3, "Grass"))
    p.append(sphere(0.1, (0.3, -0.05, 0), (1.2, 1, 0.3), 8, 5, "Moss"))
    join(p, "Graves")
    export("graves")


def ivy_wall():
    """Обломок стены в плюще: блоки кладки с рваным верхом, плети плюща свисают по фасаду."""
    reset()
    random.seed(94)
    p = []
    width = 1.0
    for row in range(5):
        z = 0.11 + row * 0.2
        right = width / 2 - max(0, row - 1) * random.uniform(0.1, 0.25)
        left = -width / 2 + max(0, row - 2) * random.uniform(0.05, 0.2)
        x = left + (0.12 if row % 2 else 0)
        while x < right:
            ln = min(0.3, right - x)
            if ln > 0.08:
                p.append(box((ln - 0.02, 0.26, 0.19), (x + ln / 2, random.uniform(-0.015, 0.015), z),
                             (0, 0, random.uniform(-0.03, 0.03)), mat=random.choice(("Stone", "Stone", "StoneDark")), bev=0.02))
            x += 0.3
    for k in range(4):  # упавшие блоки у подножия
        p.append(box((0.24, 0.2, 0.16), (random.uniform(-0.5, 0.5), random.choice((-0.3, 0.32)), 0.07), (0.1, 0.1, random.uniform(0, 3)),
                     mat="StoneDark", bev=0.02))
    # плети плюща по обеим сторонам: цепочки листьев сверху вниз
    for s in (-1, 1):
        for k in range(5):
            x = random.uniform(-0.4, 0.3)
            ztop = random.uniform(0.6, 0.95)
            ln = random.uniform(0.3, ztop)
            for j in range(int(ln / 0.06)):
                z = ztop - j * 0.06
                pos = V((x + math.sin(j * 0.9 + k) * 0.04, s * 0.14, z))
                size = random.uniform(0.07, 0.1)
                p.append(leaf_mesh(pos, V((random.uniform(-0.3, 0.3), s, -0.3)).normalized(), size, size * 0.6,
                                   random.choice(("Leaf", "LeafLight", "Leaf"))))
    foliage(p, (-0.2, 0.0, 0.82), 0.2, "Leaf", 94, flat=0.6)
    foliage(p, (0.1, 0.02, 0.62), 0.16, "LeafLight", 95, flat=0.6)
    join(p, "IvyWall")
    export("ivy_wall")


def arch():
    """Одинокая арка: два пилона, полуциркульный свод из клиньев, замок выпал; обломки у ног."""
    reset()
    random.seed(95)
    p = []
    for s in (-1, 1):
        for row in range(8):
            p.append(box((0.34, 0.32, 0.19), (s * 0.62 + random.uniform(-0.012, 0.012), 0, 0.1 + row * 0.2),
                         (0, 0, random.uniform(-0.04, 0.04)), mat="Stone" if row % 2 else "StoneDark", bev=0.008))
        p.append(box((0.4, 0.38, 0.08), (s * 0.62, 0, 1.64), mat="StoneDark", bev=0.008))  # импост
    R = 0.62
    n = 13
    for k in range(n):
        if k in (n // 2, n // 2 + 1):
            continue  # выпавшие камни у замка
        a = math.pi * (k + 0.5) / n
        c = V((math.cos(a) * R, 0, 1.68 + math.sin(a) * R))
        p.append(box((0.32, 0.3, 0.145), c, (0, -(math.pi / 2 - a), 0), mat="Stone" if k % 2 else "StoneDark", bev=0.006))
    for x, y, rz in ((0.1, 0.3, 0.6), (-0.2, -0.25, 1.9)):
        p.append(box((0.3, 0.3, 0.15), (x, y, 0.07), (0.15, 0.1, rz), mat="Stone", bev=0.008))
    p.append(sphere(0.16, (-0.62, 0.1, 1.7), (1.2, 1.2, 0.4), 8, 5, "Moss"))
    foliage(p, (0.66, 0.12, 1.75), 0.18, "Leaf", 96, flat=0.7)
    for k in range(6):  # плеть плюща вниз по правому пилону
        pos = V((0.62 + math.sin(k) * 0.05, 0.17, 1.6 - k * 0.12))
        p.append(leaf_mesh(pos, V((0.1, 1, -0.3)).normalized(), 0.1, 0.06, "Leaf" if k % 2 else "LeafLight"))
    join(p, "Arch")
    export("arch")


def drum():
    """Катящийся барабан колонны: каннелюры, сколы, мох. Центр в нуле, ось вдоль Y."""
    reset()
    random.seed(97)
    r, L = 0.32, 0.62
    o = fluted(r, L, (0, 0, 0), (math.pi / 2, 0, 0), "Marble", flutes=14, depth=0.1)
    chip(o, 97, 6, 0.08)
    p = [o]
    for s in (-1, 1):  # торцы: гладкий камень с кольцом и отверстием под штырь
        p.append(cyl(r * 0.86, 0.02, (0, s * L / 2, 0), (math.pi / 2, 0, 0), 16, "Stone"))
        p.append(torus(r * 0.6, 0.012, (0, s * (L / 2 + 0.012), 0), (math.pi / 2, 0, 0), 16, mat="StoneDark"))
        p.append(cyl(0.05, 0.02, (0, s * (L / 2 + 0.014), 0), (math.pi / 2, 0, 0), 8, "Shadow"))
    for k in range(3):  # пятна мха
        a = random.uniform(0, math.tau)
        n = V((math.cos(a), 0, math.sin(a)))
        mo = sphere(0.1, n * r + V((0, random.uniform(-0.2, 0.2), 0)), (1.3, 1.3, 0.3), 8, 5, "Moss")
        mo.rotation_mode = "QUATERNION"
        mo.rotation_quaternion = V((0, 0, 1)).rotation_difference(n)
        p.append(mo)
    join(p, "Drum")
    export("drum")


def preview(names, path):
    reset()
    scene = bpy.context.scene
    step = 1.6
    for idx, name in enumerate(names):
        before = {o.name for o in bpy.data.objects}
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + ".glb"))
        pivot = bpy.data.objects.new(f"pv_{name}", None)
        bpy.context.collection.objects.link(pivot)
        for o in [o for o in bpy.data.objects if o.name not in before]:
            if o.parent is None and o is not pivot:
                o.parent = pivot
        pivot.location = (idx * step, 0, 0.35 if name == "drum" else 0)
        pivot.rotation_euler = (0, 0, 0.5)
    width = (len(names) - 1) * step
    bpy.ops.mesh.primitive_plane_add(size=60, location=(width / 2, 0, -0.002))
    M(active(), "Antler")
    view = V((0.0, -1.0, 0.7)).normalized()
    center = V((width / 2, 0, 0.8))
    bpy.ops.object.camera_add(location=center + view * 40)
    cam = active()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width + 2.2
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
    scene.render.resolution_y = 800
    w = bpy.data.worlds.new("World")
    w.color = srgb_to_linear("#cfc9bd")
    scene.world = w
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("preview", path)


MILL = [log_stack, sawhorse, chop_block, wheelbarrow, sawdust, log_crane]
RUINS = [column_fallen, statue, graves, ivy_wall, arch, drum]
for build in MILL + RUINS:
    build()
preview([f.__name__ for f in MILL], os.path.join(ROOT, "docs", "mill_decor.png"))
preview([f.__name__ for f in RUINS], os.path.join(ROOT, "docs", "ruins_decor.png"))
