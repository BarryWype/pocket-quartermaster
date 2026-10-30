"""First-pass equipment budget, profiles and a quick check (no simulator)."""
import csv, itertools, os, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

TIER_SCALE = [1, 1.9, 3, 4.2, 5.6]          # enemy strength per tier (src/content/enemies.ts)
TIER_NAMES = ["Wood, bone", "Stone", "Copper", "Iron", "Steel"]
# Budget points at tier 1. 1 point = 1 Power = 1 Magic = 1 Armour = 1 Resistance = 10 HP.
BUDGET = {"weapon": 5.0, "armour": 6.0, "offhand": 3.0}
TWO_HANDED_BONUS = 0.9                       # share of the off-hand budget a two-handed weapon absorbs
HP_PER_POINT = 10

# Cost of non-scaling extras, as a share of the item's budget.
COST = {
    "speed": 0.09,        # per +1 Speed (negative refunds)
    "crit": 0.015,        # per +1% Crit
    "evasion": 0.05,      # per +1% Evasion
    "major": 0.10,        # Pierce, Cleave, Blessed, Guard
    "minor": 0.05,        # Parry, Reach, Stagger, Brace, Channel, Inspire, Mend
    "approach": 0.10,     # +1 approach
    "heavy": -0.10,       # drawback refund (on top of its Speed refund)
    "concealed": 0.03,
}
MAJOR = {"Pierce", "Cleave", "Blessed", "Guard"}

# slot, type, damage stat, handed, flat extras, keywords, scaling shares (normalised to what's left)
P = [
 # Weapons
 ("weapon","Sword","Power",1,{"crit":5},["Parry"],{"Power":1}),
 ("weapon","Axe","Power",1,{"speed":-1},["Cleave"],{"Power":1}),
 ("weapon","Mace","Power",1,{"speed":-1},["Blessed","Stagger"],{"Power":1}),
 ("weapon","Dagger","Power",1,{"speed":2,"crit":10},["Pierce"],{"Power":1}),
 ("weapon","Bow","Power",1,{},["Pierce","Reach"],{"Power":1}),
 ("weapon","Spear","Power",1,{},["Reach","Brace"],{"Power":1}),
 ("weapon","Warhammer","Power",2,{"speed":-2},["Pierce","Stagger"],{"Power":1}),
 ("weapon","Wand","Magic",1,{"speed":1},["Channel"],{"Magic":1}),
 ("weapon","Staff","Magic",2,{},["Cleave"],{"Magic":1}),
 ("weapon","Lute","Magic",1,{"approach":1},["Inspire"],{"Magic":1}),
 ("weapon","Censer","Magic",1,{},["Blessed","Mend"],{"Magic":1}),
 ("weapon","Knuckles","Power",1,{"speed":1},["Stagger"],{"Power":1}),
 # Armour
 ("armour","Plate","",0,{"speed":-2},["Guard"],{"Armour":0.75,"HP":0.2,"Resistance":0.05}),
 ("armour","Mail","",0,{},["Brace"],{"Armour":0.5,"Resistance":0.3,"HP":0.2}),
 ("armour","Leather","",0,{"speed":1,"evasion":8},[],{"Armour":0.45,"HP":0.4,"Resistance":0.15}),
 ("armour","Robes","",0,{},[],{"Magic":0.2,"Resistance":0.65,"HP":0.15}),
 # Off-hands
 ("offhand","Shield","",0,{"speed":-1},["Guard"],{"Armour":0.75,"HP":0.25}),
 ("offhand","Buckler","",0,{"evasion":6},["Parry"],{"Armour":1}),
 ("offhand","Off-hand blade","Power",0,{"crit":5},[],{"Power":1}),
 ("offhand","Quiver","Power",0,{},["Reach"],{"Power":1}),
 ("offhand","Tome","Magic",0,{"approach":1},[],{"Magic":1}),
 ("offhand","Focus","Magic",0,{},["Channel"],{"Magic":0.7,"Resistance":0.3}),
]
HEAVY = {"Warhammer", "Plate"}
# Casting penalty on all Magic when the armour is not favoured for the class.
CASTING_PENALTY = {"Mail": 0.15, "Plate": 0.30}
CONCEALED = {"Dagger", "Wand", "Lute", "Knuckles", "Off-hand blade"}
NOTES = {
 "Bow": "Fully functional alone; a quiver adds its bonus on top", "Quiver": "Bow only", "Shield": "One-handed weapons only",
 "Buckler": "Small Evasion for heroes below the cap", "Off-hand blade": "Damage for heroes already at the Evasion cap",
 "Lute": "+1 Presence", "Robes": "Part of the budget goes into Magic", "Tome": "+1 Wits",
}

def extras_cost(name, flat, kws):
    c = sum(COST[k] * v for k, v in flat.items())
    c += sum(COST["major"] if k in MAJOR else COST["minor"] for k in kws)
    if name in HEAVY: c += COST["heavy"]
    if name in CONCEALED: c += COST["concealed"]
    return c

def item(slot, name, dmg, hand, flat, kws, shares, tier):
    b = BUDGET[slot] * (1 + (TWO_HANDED_BONUS * BUDGET["offhand"] / BUDGET["weapon"] if hand == 2 else 0))
    left = b * (1 - extras_cost(name, flat, kws)) * TIER_SCALE[tier - 1]
    tot = sum(shares.values())
    s = {k: left * v / tot for k, v in shares.items()}
    out = {k: 0.0 for k in ["Power", "Magic", "Armour", "Resistance", "HP"]}
    for k, v in s.items(): out[k] = v * (HP_PER_POINT if k == "HP" else 1)
    out["Speed"] = flat.get("speed", 0)
    out["Crit"] = flat.get("crit", 0)
    out["Evasion"] = flat.get("evasion", 0) + (tier - 1 if flat.get("evasion") else 0)  # +1%/tier on evasion items
    return out

# --- profiles CSV
with open(f"{OUT}/equipment-profiles.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Slot","Type","Damage stat","Hands","Budget spent on extras","Speed","Crit %","Evasion %","Approach","Keywords","Heavy","Concealed","Scaling split","Note"])
    for slot, name, dmg, hand, flat, kws, shares in P:
        tot = sum(shares.values())
        split = ", ".join(f"{k} {round(100*v/tot)}%" for k, v in shares.items())
        w.writerow([slot.capitalize(), name, dmg, {0:"",1:"One",2:"Two"}[hand], f"{round(100*extras_cost(name, flat, kws))}%",
                    flat.get("speed",""), flat.get("crit",""), flat.get("evasion",""), flat.get("approach",""),
                    ", ".join(kws), int(name in HEAVY), int(name in CONCEALED), split, NOTES.get(name,"")])

# --- tiers CSV (all items at all tiers)
with open(f"{OUT}/equipment-tiers.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Slot","Type","Tier","Tier name","Power","Magic","Armour","Resistance","HP","Speed","Crit %","Evasion %"])
    for p in P:
        for t in range(1, 6):
            it = item(*p, t)
            w.writerow([p[0].capitalize(), p[1], t, TIER_NAMES[t-1]] + [round(it[k]) for k in ["Power","Magic","Armour","Resistance","HP"]] + [it["Speed"], it["Crit"], it["Evasion"]])

# --- quick check at tier 3
T = 3
CRIT_MULT = 1.5
ENEMY_SPEED = 0
def offence(weapon, offhand=None, scenario="normal", element="neutral"):
    w = item(*weapon, T); o = item(*offhand, T) if offhand else {k: 0 for k in w}
    power, magic = w["Power"] + o["Power"], w["Magic"] + o["Magic"]
    kws = set(weapon[5]) | set(offhand[5] if offhand else [])
    speed = w["Speed"] + o["Speed"]; crit = (5 + w["Crit"] + o["Crit"]) / 100
    extra = max(0.0, min(0.5, (speed - ENEMY_SPEED) * 0.1))  # chance of a second attack
    slow = min(0, speed - ENEMY_SPEED) * 0.05                   # slower: enemies act first, lost tempo
    phys, mag = power, magic
    wheel = {"weak": 1.5, "neutral": 1.0, "strong": 0.75}[element]
    if "Channel" in kws and element == "weak": wheel = 1.7
    mag *= wheel
    if scenario == "armoured":
        phys *= 1 if "Pierce" in kws else 0.65; mag *= 1 if "Pierce" in kws else 0.825  # magic partly ignores armour
    if scenario == "swarm" and "Cleave" in kws: phys *= 1.5; mag *= 1.5
    if scenario == "undead" and "Blessed" not in kws: phys /= 1.4; mag /= 1.4
    dmg = (phys + mag) * (1 + crit * (CRIT_MULT - 1)) * (1 + extra) * (1 + slow)
    if "Reach" in kws: dmg *= 1.05
    if "Stagger" in kws: dmg *= 1.05
    if "Inspire" in kws: dmg *= 1.03  # own share of a party buff
    return dmg

def defence(armour, offhand=None, kind="physical"):
    a = item(*armour, T); o = item(*offhand, T) if offhand else {k: 0 for k in a}
    hp = 60 * TIER_SCALE[T-1] + a["HP"] + o["HP"]          # hero base HP stand-in
    arm = a["Armour"] + o["Armour"]; res = a["Resistance"] + o["Resistance"]
    ev = min(40, a["Evasion"] + o["Evasion"]) / 100
    red = 100 / (100 + 3 * (arm if kind == "physical" else res))
    kws = set(armour[5]) | set(offhand[5] if offhand else [])
    bonus = (1.08 if 'Brace' in kws else 1) * (1.05 if 'Parry' in kws and kind == 'physical' else 1)
    return hp / red / (1 - ev) * bonus

weapons = [p for p in P if p[0] == "weapon"]; offhands = [p for p in P if p[0] == "offhand"]; armours = [p for p in P if p[0] == "armour"]
def allowed(w, o):
    if w[3] == 2: return o is None
    if w[1] == "Bow": return o is not None and o[1] == "Quiver"
    if o and o[1] == "Quiver": return False
    if o and o[2] and w[2] and o[2] != w[2]: return False  # damage off-hand must match the weapon's damage stat
    return o is not None
loadouts = [(w, o) for w in weapons for o in [None] + offhands if allowed(w, o)]
scen = [("normal","neutral"),("armoured","neutral"),("swarm","neutral"),("undead","neutral"),("normal","weak"),("normal","strong")]
rows = []
for w, o in loadouts:
    rows.append([w[1] + (" + " + o[1] if o else "")] + [offence(w, o, s, e) for s, e in scen])
best = {i: max(rows, key=lambda r: r[i+1])[0] for i in range(len(scen))}
ref = next(r for r in rows if r[0] == "Sword + Off-hand blade")
with open(f"{OUT}/equipment-check-offence.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["Loadout (tier 3)"] + [f"{s} / {e}" for s, e in scen] + ["Neutral vs sword + blade"])
    for r in sorted(rows, key=lambda r: -r[1]):
        w.writerow([r[0]] + [round(x, 1) for x in r[1:]] + [f"{round(100*r[1]/ref[1]-100):+d}%"])
dr = []
for a in armours:
    for o in [None, next(p for p in offhands if p[1]=="Shield"), next(p for p in offhands if p[1]=="Buckler")]:
        dr.append([a[1] + (" + " + o[1] if o else ""), defence(a, o, "physical"), defence(a, o, "magic")])
with open(f"{OUT}/equipment-check-defence.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["Armour (tier 3)", "Effective HP vs physical", "Effective HP vs magic"])
    for r in dr: w.writerow([r[0], round(r[1]), round(r[2])])

print("Best offence per scenario:", {f"{s}/{e}": best[i] for i, (s, e) in enumerate(scen)})
winners = {}
for r in rows:
    wins = [f"{s}/{e}" for i, (s, e) in enumerate(scen) if best[i] == r[0]]
    if wins: winners[r[0]] = wins
print("Winners:", winners)
print("Neutral spread vs sword+blade:", {r[0]: f"{round(100*r[1]/ref[1]-100):+d}%" for r in sorted(rows, key=lambda r: -r[1])})
print("Defence:", [(r[0], round(r[1]), round(r[2])) for r in dr])

# --- caster armour choice (tier 3): base Magic stand-in + wand + tome + armour Magic
wand = next(p for p in P if p[1] == "Wand"); tome = next(p for p in P if p[1] == "Tome")
def caster(armour, favoured):
    a = item(*armour, T)
    magic = 4 * TIER_SCALE[T-1] + item(*wand, T)["Magic"] + item(*tome, T)["Magic"] + a["Magic"]
    pen = 0 if armour[1] in favoured else CASTING_PENALTY.get(armour[1], 0)
    return magic * (1 - pen), defence(armour, None, "physical"), defence(armour, None, "magic")
cr = []
for who, fav in [("Mage (robes favoured)", {"Robes"}), ("Cleric (mail favoured)", {"Mail"}), ("Paladin (mail, plate favoured)", {"Mail", "Plate"})]:
    base = caster(next(p for p in armours if p[1] == "Robes"), fav)[0]
    for a in armours:
        m, dp, dm = caster(a, fav)
        cr.append([who, a[1], round(m, 1), f"{round(100*m/base-100):+d}%", round(dp), round(dm)])
with open(f"{OUT}/equipment-check-caster.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["Hero", "Armour (tier 3)", "Total Magic", "vs robes", "Effective HP vs physical", "Effective HP vs magic"])
    w.writerows(cr)
for r in cr: print(r)
