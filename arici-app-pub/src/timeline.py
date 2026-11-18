"""Single source of truth for timings shared by the picture and the sound."""
import math
import json
import os

from common import clamp, prog, e_out_cubic, e_inout_cubic

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg_path = os.path.join(ROOT, 'build', 'timing.json')
_cfg = json.load(open(_cfg_path)) if os.path.exists(_cfg_path) else {}

T_TOTAL = float(_cfg.get('total', 17.7))
HOLD_START = 16.06          # from here the picture is perfectly still

# scene boundaries (s)
S1, S2, S3, S4, S5, S6 = 0.0, 2.5, 6.0, 10.0, 13.0, 15.5

# transitions
T_WHIP1 = (2.26, 2.56)       # S1 -> S2 whip up
T_SCROLL = (2.95, 4.2)
FLY_OUT = [4.32, 4.5, 4.68]  # product cards jump out
T_FLYCAM = (5.5, 6.0)        # cards fly into the camera
T_EXPAND = (6.04, 6.5)       # roue card -> full screen
T_TAP = 6.86                 # finger presses "Jouer"
SPIN0, SPIN1, SPIN_SETTLE = 6.95, 9.3, 9.62
T_SHRINK = (9.98, 10.32)     # roulette -> points card
COUNT0, COUNT1 = 10.45, 11.6
T_FLIP = (12.84, 12.98)
GIFT_LAND = 13.26
LID_POP = 13.5
T_QR_IN = (14.02, 14.46)
SCAN = (14.72, 15.08)
T_FINAL = (15.32, 15.98)     # final phone slide+spin
PHONE_LAND = 15.98

# ---------------------------------------------------------------- wheel
TURNS = 5
WIN_OFFSET = -9.0            # degrees off the segment centre (looks natural)
OVERSHOOT = 4.0
TARGET = 360 * TURNS + 270 + WIN_OFFSET   # '50 points' (segment 2, centred at +90deg) under the pointer
_RAMP = 0.24
_P = 2.1


def _omega_shape(u, D):
    if u <= 0:
        return 0.0
    if u < _RAMP:
        return math.sin(math.pi / 2 * u / _RAMP) ** 2
    if u >= D:
        return 0.0
    return (1 - (u - _RAMP) / (D - _RAMP)) ** _P


def _build_wheel_table():
    D = SPIN1 - SPIN0
    n = 4000
    du = D / n
    acc = [0.0]
    for i in range(n):
        u = (i + 0.5) * du
        acc.append(acc[-1] + _omega_shape(u, D) * du)
    scale = (TARGET + OVERSHOOT) / acc[-1]
    return [a * scale for a in acc], du, scale


_WT, _WDU, _WSCALE = _build_wheel_table()
WHEEL_PEAK_DPS = _WSCALE  # deg/s at full speed


def wheel_angle(t):
    """Clockwise rotation of the wheel in degrees."""
    if t <= SPIN0:
        return 0.0
    if t < SPIN1:
        x = (t - SPIN0) / _WDU
        i = int(x)
        f = x - i
        return _WT[i] + (_WT[min(i + 1, len(_WT) - 1)] - _WT[i]) * f
    # settle back from the overshoot with a small damped bounce
    u = t - SPIN1
    return TARGET + OVERSHOOT * math.exp(-7.5 * u) * math.cos(2 * math.pi * 2.4 * u)


def wheel_speed(t, dt=1 / 240):
    return abs(wheel_angle(t + dt) - wheel_angle(t - dt)) / (2 * dt)


def wheel_click_times():
    """Times when a segment edge passes under the top pointer."""
    times = []
    step = 1 / 2000
    t = SPIN0
    prev = wheel_angle(t)
    while t < SPIN_SETTLE + 0.3:
        t += step
        a = wheel_angle(t)
        # edges at 22.5 + 45k in wheel frame; pointer at 0 => edge passes when (22.5 + a) crosses k*45
        k0 = math.floor((prev + 22.5) / 45)
        k1 = math.floor((a + 22.5) / 45)
        if k1 != k0:
            times.append(t)
        prev = a
    return times


# ---------------------------------------------------------------- counter
P_FROM, P_TO, P_GOAL = 174, 224, 200


def points_at(t):
    x = e_inout_cubic(prog(t, COUNT0, COUNT1))
    return int(round(P_FROM + (P_TO - P_FROM) * x))


def time_points_reach(v):
    lo, hi = COUNT0, COUNT1
    for _ in range(40):
        mid = (lo + hi) / 2
        if points_at(mid) >= v:
            hi = mid
        else:
            lo = mid
    return hi


T_GOAL = time_points_reach(P_GOAL)


def counter_tick_times(min_gap=0.028):
    out = []
    last = -1
    prev = points_at(COUNT0)
    t = COUNT0
    while t <= COUNT1 + 0.02:
        t += 1 / 1000
        v = points_at(t)
        if v != prev and t - last >= min_gap:
            out.append((t, v))
            last = t
        prev = v
    return out


# ---------------------------------------------------------------- voice slots (start times, s)
VOICE_SLOTS = _cfg.get('voice_slots', {
    'v1': 0.22, 'v2': 2.62, 'v3': 6.12, 'v4': 10.12, 'v5': 13.08, 'v6': 15.42,
})
