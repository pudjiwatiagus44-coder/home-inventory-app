from PIL import Image, ImageDraw

OUT = r"C:\Users\Administrator\Desktop\home-inventory-app\_tmp\icon-preview"
SIZE = 1024
SS = 4  # supersample factor
S = SIZE * SS

GREEN = (78, 111, 93, 255)
WHITE = (255, 255, 255, 255)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_background(draw):
    rounded_rect(draw, (40 * SS, 40 * SS, 984 * SS, 984 * SS), 220 * SS, GREEN)


def house(draw):
    # roof
    draw.polygon(
        [(512 * SS, 250 * SS), (250 * SS, 540 * SS), (774 * SS, 540 * SS)],
        fill=WHITE,
    )
    # body
    draw.rectangle([250 * SS, 540 * SS, 774 * SS, 760 * SS], fill=WHITE)
    # door (cutout)
    draw.rectangle([445 * SS, 610 * SS, 579 * SS, 760 * SS], fill=GREEN)


def house_box(draw):
    # house: roof + body (same width as the box below -> continuous column)
    draw.polygon(
        [(512 * SS, 230 * SS), (310 * SS, 440 * SS), (714 * SS, 440 * SS)],
        fill=WHITE,
    )
    draw.rectangle([310 * SS, 440 * SS, 714 * SS, 560 * SS], fill=WHITE)
    # door cutout, full body height
    draw.rectangle([472 * SS, 500 * SS, 552 * SS, 560 * SS], fill=GREEN)
    # storage box below (house bottom = box top, same width)
    draw.rectangle([310 * SS, 560 * SS, 714 * SS, 790 * SS], fill=WHITE)
    # single centered packing strap
    draw.rectangle([310 * SS, 672 * SS, 714 * SS, 690 * SS], fill=GREEN)


def chest(draw):
    # open carton: body + two side flaps
    draw.rectangle([250 * SS, 430 * SS, 774 * SS, 710 * SS], fill=WHITE)
    draw.polygon(
        [(250 * SS, 430 * SS), (332 * SS, 340 * SS), (414 * SS, 430 * SS)],
        fill=WHITE,
    )
    draw.polygon(
        [(774 * SS, 430 * SS), (692 * SS, 340 * SS), (610 * SS, 430 * SS)],
        fill=WHITE,
    )
    # front crease lines so it reads as a carton
    draw.rectangle([250 * SS, 436 * SS, 774 * SS, 444 * SS], fill=GREEN)


VARIANTS = {
    "icon-a-house": house,
    "icon-b-housebox": house_box,
    "icon-c-chest": chest,
    "icon-d-house9": None,
    "icon-e-house6": None,
}


def house_grid(draw, cols, rows):
    # roof
    draw.polygon(
        [(512 * SS, 230 * SS), (280 * SS, 470 * SS), (744 * SS, 470 * SS)],
        fill=WHITE,
    )
    # body (storage area)
    draw.rectangle([280 * SS, 470 * SS, 744 * SS, 790 * SS], fill=WHITE)
    # grid lines (green) inside the body
    x0, x1, y0, y1 = 280 * SS, 744 * SS, 470 * SS, 790 * SS
    lw = 24 * SS
    for c in range(1, cols):
        x = x0 + (x1 - x0) * c // cols
        draw.rectangle([x - lw // 2, y0, x + lw // 2, y1], fill=GREEN)
    for r in range(1, rows):
        y = y0 + (y1 - y0) * r // rows
        draw.rectangle([x0, y - lw // 2, x1, y + lw // 2], fill=GREEN)


def house_grid9(draw):
    house_grid(draw, 3, 3)


def house_grid6(draw):
    house_grid(draw, 3, 2)


def _cell_rect(r, c):
    x0, x1, y0, y1 = 280, 744, 470, 790
    cw = (x1 - x0) // 3
    ch = (y1 - y0) // 3
    return (
        (x0 + c * cw) * SS,
        (x0 + (c + 1) * cw) * SS,
        (y0 + r * ch) * SS,
        (y0 + (r + 1) * ch) * SS,
    )


def house_grid_drawers(draw):
    house_grid(draw, 3, 3)
    for r in range(3):
        for c in range(3):
            cx0, cx1, cy0, cy1 = _cell_rect(r, c)
            cw = (cx1 - cx0) // SS
            hw = 72 * SS
            hh = 18 * SS
            hx = cx0 + ((cw * SS) - hw) // 2
            hy = cy0 + 32 * SS
            draw.rectangle([hx, hy, hx + hw, hy + hh], fill=GREEN)


def house_grid_cartons(draw):
    house_grid(draw, 3, 3)
    for (r, c) in [(0, 0), (1, 1), (2, 2)]:
        cx0, cx1, cy0, cy1 = _cell_rect(r, c)
        W = (cx1 - cx0) // SS
        top = cy0 + 34 * SS
        bot = cy1 - 14 * SS
        left = cx0 + 14 * SS
        right = cx1 - 14 * SS
        mid = (left + right) // 2
        # box body: white square-cornered carton with green outline
        draw.rectangle([left, top, right, bot], fill=WHITE, outline=GREEN, width=10 * SS)
        # open lid flaps: two solid green triangles rising from the top edge
        apex_l = mid - W * SS // 6
        apex_r = mid + W * SS // 6
        ftop = top - 24 * SS
        draw.polygon(
            [(left, top), (apex_l, ftop), (mid, top)],
            fill=GREEN,
        )
        draw.polygon(
            [(right, top), (apex_r, ftop), (mid, top)],
            fill=GREEN,
        )


VARIANTS = {
    "icon-a-house": house,
    "icon-b-housebox": house_box,
    "icon-c-chest": chest,
    "icon-d-house9": house_grid9,
    "icon-e-house6": house_grid6,
    "icon-f-house9-drawers": house_grid_drawers,
    "icon-g-house9-cartons": house_grid_cartons,
}


for name, fn in VARIANTS.items():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_background(draw)
    fn(draw)
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(f"{OUT}\\{name}.png")
    print(name, "ok")
