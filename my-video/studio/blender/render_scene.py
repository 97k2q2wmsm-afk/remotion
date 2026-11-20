"""Cinematic AI Studio — headless Blender scene builder/renderer.

Usage (the studio runs this for "blender_3d" scenes):
    blender -b --factory-startup --python-exit-code 1 -P render_scene.py -- spec.json

spec.json = {scene, fps, width, height, engine, samples, out_dir, characters}
Writes out_dir/frame_00001.png … which the studio assembles into an MP4.

Builds a stylised set from the same scene record the Three.js engine uses:
displaced terrain, environment props, sun + sky from the lighting preset, world
fog for volumetric scenes, and a keyframed camera for the requested move.
"""
import json
import math
import random
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: blender -b -P render_scene.py -- spec.json")
spec = json.load(open(argv[0]))
scene_spec = spec["scene"]
rng = random.Random(scene_spec.get("seed", 1))

# ── Lighting presets (mirrors src/cinematic/engine/Lighting.tsx) ────────────
LIGHT = {
    "cinematic_sunset": dict(el=5, az=200, sun=(1.0, 0.6, 0.3), energy=3.5, sky=1.0, fog=(0.85, 0.55, 0.4)),
    "golden_hour": dict(el=14, az=215, sun=(1.0, 0.76, 0.48), energy=4.0, sky=1.0, fog=(0.88, 0.75, 0.6)),
    "noon_sun": dict(el=62, az=160, sun=(1.0, 0.97, 0.91), energy=5.0, sky=1.0, fog=(0.77, 0.85, 0.93)),
    "overcast_day": dict(el=40, az=180, sun=(0.87, 0.9, 0.92), energy=1.2, sky=0.7, fog=(0.7, 0.74, 0.77)),
    "blue_hour": dict(el=-4, az=230, sun=(0.49, 0.55, 0.81), energy=0.6, sky=0.35, fog=(0.23, 0.28, 0.46)),
    "moonlit_night": dict(el=35, az=120, sun=(0.62, 0.7, 1.0), energy=0.25, sky=0.05, fog=(0.07, 0.1, 0.2)),
    "stormy": dict(el=25, az=190, sun=(0.77, 0.8, 0.83), energy=1.3, sky=0.5, fog=(0.35, 0.39, 0.43)),
    "day_to_night": dict(el=10, az=210, sun=(1.0, 0.7, 0.45), energy=3.0, sky=0.9, fog=(0.8, 0.6, 0.5)),
}
SHOT = {  # dist, height (× subject size), look-ahead
    "aerial_establishing": (7.5, 2.4, 3.2), "wide": (4.0, 0.75, 1.0), "medium": (1.9, 0.5, 0),
    "close_up": (0.85, 0.45, 0), "low_angle": (1.6, 0.08, 0), "over_shoulder": (0.9, 0.5, 0),
}
ENV = {  # subject size, terrain amplitude, ground colour
    "forest": (13, 6, (0.13, 0.22, 0.08)), "mountains": (26, 60, (0.25, 0.3, 0.16)), "city": (62, 0, (0.08, 0.08, 0.09)),
    "medieval_village": (14, 4, (0.2, 0.26, 0.1)), "ancient_roman_city": (18, 2, (0.45, 0.4, 0.26)), "modern_street": (7, 0, (0.07, 0.07, 0.08)),
    "futuristic_city": (46, 0, (0.03, 0.035, 0.05)), "battlefield": (20, 5, (0.2, 0.16, 0.11)), "interior": (2.4, 0, (0.3, 0.2, 0.12)),
    "ocean_coast": (16, 3, (0.6, 0.52, 0.36)),
}

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

sc = bpy.context.scene
env_id = scene_spec["environment"]
size, amp, ground_rgb = ENV[env_id]
L = LIGHT[scene_spec["lighting"]]
night = L["energy"] < 1.0


def material(name, rgb, rough=0.8, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        key = "Emission Color" if "Emission Color" in b.inputs else "Emission"
        b.inputs[key].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def add(kind, loc, scale, mat, rot=(0, 0, 0)):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.5, depth=1, location=loc, rotation=rot)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=1, depth=1, location=loc, rotation=rot)
    elif kind == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = scale
    ob.data.materials.append(mat)
    return ob


# ── Terrain ─────────────────────────────────────────────────────────────────
radius = max(size * 14, 60)
bpy.ops.mesh.primitive_plane_add(size=radius * 2.5, location=(0, 0, 0))
ground = bpy.context.active_object
ground.data.materials.append(material("ground", ground_rgb, 0.95))
if amp > 0:
    sub = ground.modifiers.new("sub", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = sub.render_levels = 6
    tex = bpy.data.textures.new("terrain", "CLOUDS")
    tex.noise_scale = radius * 0.25
    disp = ground.modifiers.new("disp", "DISPLACE")
    disp.texture = tex
    disp.strength = amp
    disp.mid_level = 0.55


def h(x, y):
    return 0.0  # props stand on the mean ground plane; displacement is centred


# ── Environment props ───────────────────────────────────────────────────────
stone = material("stone", (0.75, 0.68, 0.55), 0.85)
marble = material("marble", (0.9, 0.87, 0.8), 0.5)
roof = material("roof", (0.55, 0.25, 0.15), 0.85)
leaf = material("leaf", (0.12, 0.3, 0.1), 0.9)
bark = material("bark", (0.2, 0.15, 0.1), 0.95)
lit = (1.0, 0.8, 0.5)
facade = material("facade", (0.55, 0.55, 0.58), 0.6, 0.1, emit=lit if night else None, strength=0.6 if night else 0)
neon = material("neon", (0.05, 0.05, 0.06), 0.3, 0.6, emit=(0.2, 0.95, 1.0), strength=6)

if env_id in ("forest", "mountains", "medieval_village", "battlefield", "ocean_coast"):
    n = {"forest": 260, "mountains": 160, "medieval_village": 90, "battlefield": 20, "ocean_coast": 60}[env_id]
    for _ in range(n):
        a, d = rng.random() * math.tau, size * (0.9 + rng.random() * 9)
        x, y, s = math.cos(a) * d, math.sin(a) * d, 1.6 + rng.random() * 1.6
        if env_id == "ocean_coast" and y > 0:
            continue
        add("cyl", (x, y, s), (0.5 * s, 0.5 * s, 2 * s), bark)
        add("cone", (x, y, s * 3.5), (1.8 * s, 1.8 * s, 4 * s), leaf)
if env_id in ("city", "futuristic_city", "modern_street"):
    step = {"city": 44, "futuristic_city": 48, "modern_street": 14}[env_id]
    for gx in range(-6, 7):
        for gy in range(-6, 7):
            if env_id == "modern_street" and abs(gx) < 1:
                continue
            if env_id != "modern_street" and abs(gx) + abs(gy) < 1:
                continue
            hgt = 10 + rng.random() * (40 if env_id == "modern_street" else 160) * math.exp(-math.hypot(gx, gy) / 5)
            w = step * 0.6
            add("cube", (gx * step, gy * step, hgt / 2), (w, w, hgt), neon if env_id == "futuristic_city" and rng.random() < 0.15 else facade)
if env_id == "ancient_roman_city":
    add("cube", (0, -35, 2), (34, 34, 4), stone)
    add("cube", (0, -38, 11), (22, 18, 14), marble)
    for i in range(8):
        for yy in (-22, -48):
            add("cyl", (-14 + i * 4, yy, 11.5), (1.7, 1.7, 15), marble)
    for i in range(64):
        a = i / 64 * math.tau
        for tier in range(3):
            add("cube", (-110 + math.cos(a) * 50, -130 + math.sin(a) * 41, 5 + tier * 10), (1.6, 2.2, 7), stone, rot=(0, 0, a))
    for _ in range(80):
        x, y = rng.uniform(-180, 180), rng.uniform(-180, 180)
        if abs(x) < 36 and -60 < y < 30:
            continue
        hh = 5 + rng.random() * 10
        add("cube", (x, y, hh / 2), (10, 10, hh), stone)
if env_id == "medieval_village":
    for _ in range(40):
        a, d = rng.random() * math.tau, 17 + rng.random() * 40
        x, y = math.cos(a) * d, math.sin(a) * d
        add("cube", (x, y, 2.5), (7, 6, 5), material("plaster", (0.85, 0.8, 0.7), 0.9))
        add("cone", (x, y, 6.5), (5, 5, 3.5), roof)
if env_id == "battlefield":
    for _ in range(140):
        add("cyl", (rng.uniform(-70, 70), rng.uniform(-70, 70), 1.2), (0.12, 0.12, 2.6), bark, rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0))
    for side, col in ((-1, (0.5, 0.1, 0.1)), (1, (0.15, 0.22, 0.35))):
        m = material(f"army{side}", col, 0.9)
        for i in range(60):
            add("cyl", (side * (30 + (i // 12) * 2.2), (i % 12 - 6) * 2.6, 0.9), (0.45, 0.45, 1.8), m)
if env_id == "ocean_coast":
    bpy.ops.mesh.primitive_plane_add(size=radius * 2, location=(0, radius * 0.9, 0.2))
    water = bpy.context.active_object
    water.data.materials.append(material("water", (0.03, 0.18, 0.25), 0.05, 0.0))
    oc = water.modifiers.new("ocean", "OCEAN")
    oc.size, oc.resolution, oc.wave_scale = 4, 10, 1.2
    oc.time = 0
    oc.keyframe_insert("time", frame=1)
    oc.time = scene_spec["duration"]
    oc.keyframe_insert("time", frame=max(2, round(scene_spec["duration"] * spec["fps"])))
if env_id == "interior":
    wall = material("wall", (0.85, 0.8, 0.7), 0.95)
    add("cube", (0, 0, -0.05), (14, 11, 0.1), material("floor", (0.35, 0.22, 0.12), 0.5))
    for x, y, sx, sy in ((0, -5.5, 14, 0.4), (0, 5.5, 14, 0.4), (-7, 0, 0.4, 11), (7, 0, 0.4, 11)):
        add("cube", (x, y, 2.2), (sx, sy, 4.4), wall)
    add("cube", (0, 0, 4.45), (14, 11, 0.1), wall)
    add("cube", (0, 0, 0.82), (2.6, 1.3, 0.08), material("table", (0.36, 0.23, 0.13), 0.45))
    for wx in (-3, 3):  # window holes are faked with emissive panes
        add("cube", (wx, -5.25, 2.35), (2.2, 0.05, 2.3), material("window", (1, 1, 1), 0.1, emit=L["sun"], strength=4))

# Characters: simple capsules in their palette so recurring characters keep their colours.
for i, c in enumerate(spec.get("characters", [])):
    top = tuple(int(c["palette"]["top"][k:k + 2], 16) / 255 for k in (1, 3, 5))
    skin = tuple(int(c["palette"]["skin"][k:k + 2], 16) / 255 for k in (1, 3, 5))
    s = c.get("scale", 1.75)
    x = (i - (len(spec["characters"]) - 1) / 2) * 1.1
    add("cyl", (x, 0, s * 0.4), (0.4 * s / 1.75, 0.3 * s / 1.75, s * 0.8), material(f"c{i}", top, 0.85))
    add("ico", (x, 0, s * 0.92), (0.12 * s / 1.75,) * 3, material(f"s{i}", skin, 0.6))

# ── Sun, sky, fog ───────────────────────────────────────────────────────────
bpy.ops.object.light_add(type="SUN", location=(0, 0, 50))
sun = bpy.context.active_object
sun.data.energy = L["energy"] * 0.65
sun.data.color = L["sun"]
sun.data.angle = math.radians(1.5)
el, az = math.radians(L["el"]), math.radians(L["az"])
sun.rotation_euler = (math.pi / 2 - el, 0, az + math.pi)

world = bpy.data.worlds.new("sky")
sc.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes["Background"]
sky = nt.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA"
sky.sun_elevation = max(el, math.radians(-2))
sky.sun_rotation = az
nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = L["sky"] * 0.3
atm = set(scene_spec.get("atmosphere", []))
if "volumetric_fog" in atm or scene_spec["lighting"] == "stormy":
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*L["fog"], 1)
    vol.inputs["Density"].default_value = 0.6 / max(radius, 1)
    nt.links.new(vol.outputs["Volume"], nt.nodes["World Output"].inputs["Volume"])

# ── Camera move ─────────────────────────────────────────────────────────────
cam_spec = scene_spec["camera"]
dist, height, ahead = SHOT[cam_spec["shot"]]
bpy.ops.object.camera_add()
cam = bpy.context.active_object
cam.data.lens = cam_spec["lens"]
cam.data.sensor_width = 36
sc.camera = cam
bpy.ops.object.empty_add(location=(0, 0, size * 0.15))
target = bpy.context.active_object
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis, track.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
if cam_spec.get("depth_of_field") and cam_spec["shot"] != "aerial_establishing":
    cam.data.dof.use_dof = True
    cam.data.dof.focus_object = target
    cam.data.dof.aperture_fstop = 2.8

frames = max(2, round(scene_spec["duration"] * spec["fps"]))
move = cam_spec["movement"]


def pose(t):
    d, hh, ang, lat, fwd = dist * size, height * size, 0.0, 0.0, 0.0
    if move in ("slow_forward_dolly", "handheld"):
        d *= 1 - 0.28 * t
    elif move == "push_in":
        d *= 1 - 0.45 * t
    elif move == "dolly_out":
        d *= 0.72 + 0.5 * t
    elif move in ("tracking_left", "tracking_right"):
        lat = (t - 0.5) * size * 1.6 * (-1 if move == "tracking_left" else 1)
    elif move == "crane_up":
        hh = hh * 0.25 + (hh + size * 2.2) * t
    elif move == "crane_down":
        hh = hh * 0.25 + (hh + size * 2.2) * (1 - t)
    elif move == "aerial_flyover":
        hh, fwd = max(hh, size * 3.5), (t - 0.35) * size * 5
    elif move == "orbit":
        ang = (t - 0.5) * 1.1
    # Blender is Z-up; the Three.js engine's +Z (towards camera) maps to -Y here.
    cx, cy = math.sin(ang) * d + math.cos(ang) * lat, -(math.cos(ang) * d - fwd)
    tx, ty = math.cos(ang) * lat * 0.5, fwd * 1.15 + ahead * size
    return (cx, cy, max(hh, 0.6)), (tx, ty, size * 0.15)


for f in range(1, frames + 1):
    t = (f - 1) / (frames - 1)
    t = t * t * (3 - 2 * t)
    (cx, cy, cz), (tx, ty, tz) = pose(t)
    if move == "handheld" or cam_spec.get("shake", 0) > 0:
        k = max(0.6 if move == "handheld" else 0, cam_spec.get("shake", 0)) * 0.15 * min(size, 6)
        cx += math.sin(f * 0.37) * k
        cz += math.sin(f * 0.53 + 1) * k * 0.6
    cam.location = (cx, cy, cz)
    target.location = (tx, ty, tz)
    cam.keyframe_insert("location", frame=f)
    target.keyframe_insert("location", frame=f)

# ── Render settings ─────────────────────────────────────────────────────────
sc.frame_start, sc.frame_end = 1, frames
sc.render.fps = spec["fps"]
sc.render.resolution_x, sc.render.resolution_y = spec["width"], spec["height"]
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"
sc.render.filepath = spec["out_dir"].rstrip("/") + "/frame_#####"
sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
wanted = spec.get("engine", "CYCLES").upper()
if wanted.startswith("EEVEE"):
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
else:
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = int(spec.get("samples", 32))
    # Distro builds sometimes ship without OpenImageDenoise; only denoise when it exists.
    has_oidn = bool(getattr(bpy.app.build_options, "openimagedenoise", False))
    sc.cycles.use_denoising = has_oidn
    if has_oidn:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    else:
        print("render_scene: this Blender build has no OpenImageDenoise — expect grain at low sample counts", flush=True)
    sc.cycles.use_adaptive_sampling = True
    # Keep the BVH/scene data between frames: only the camera moves.
    sc.render.use_persistent_data = True
print(f"render_scene: {env_id} / {move} / {frames} frames / {sc.render.engine}", flush=True)
bpy.ops.render.render(animation=True)
