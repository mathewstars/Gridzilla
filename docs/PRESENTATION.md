# Gridzilla pitch: run of show and script

Deck: `docs/Gridzilla-pitch.pptx` (the PDF has no audio). Jingle: embedded on slide 1, also `docs/Gridzilla-jingle.m4a`.
Three windows open before you start: the deck, the board at https://gridzilla.victronlab.sk, VRM with the Blatnica plant.
Board: Presentation tab, chip VIENNA, "follow autopilot" on. Check the clock top right says "sim" and the heartbeat pill is green.

Speaker roles are a suggestion: M = Mathew (story, demo), P = Peter (autopilot, guard, diet plan), MT = Matthew (weather, production).

## Four and a half minutes

Seven slides presented, eight in the appendix for questions. The jingle costs 30 seconds and earns them back. Ten seconds of slack at the end.

| time | slide | speaker | beat |
|---|---|---|---|
| 0:00 | 1 Title | M | Jingle, 30 s, say nothing, then one line. |
| 0:30 | 2 Problem | M | The storage exists, the signal does not. |
| 0:55 | 3 The idea | M | One signed message. Owner wins. Meter pays. |
| 1:35 | 4 The monster eats peaks | P | Outcome first, no mechanism. |
| 2:15 | 5 Live demo | M + P | Board: Vienna curve, the AI's decision, Flattening tab, Blatnica, heartbeat. 75 s. |
| 3:30 | 6 Real vs simulated | MT | Measured numbers, honest counterfactual. |
| 3:55 | 7 Close | M | The ask. "It eats peaks for breakfast." Stop at 4:20. |
| appendix | signals, household, autopilot, built, makers, production, old curve, security | | For questions. |

### Script

**1. Title (0:00 to 0:30).** Click the speaker. Say nothing until the hard cut. Then, deadpan:

> Now you probably wonder what the monster really is.

**2. Problem (0:30 to 0:55).**

> It is a grid signal that home batteries, cars and heat pumps follow. Europe's largest battery is in people's basements, and the grid can use none of it. Slovakia has no signal at all. Germany has a dimmer switch on one device. Ukraine had three gigawatt hours of home storage sitting idle through the blackouts. The storage exists. The signal does not.

**3. The idea (0:55 to 1:35).**

> One signed message. The operator says: this street, next three hours, take at most three kilowatts per house. Never "discharge now", never a setting. The house decides how: battery first, car second, hot water third. The owner's limits always win. If the operator goes silent, every house is back to normal in two minutes. The meter checks it, the meter pays it. An AI proposes every fifteen minutes, thirty lines of rules decide, the platform signs.

**4. The monster eats peaks (1:35 to 2:15).**

> Gridzilla eats peaks. Every street, every evening. At six the cars come home and the transformer would go to a hundred and ten percent. With Gridzilla it stays at seventy. The cars still charge, just not at dinner: plugged in at six, trickle through the evening, full by seven in the morning. The batteries eat the dinner spike, the noon sun charges them. Nobody at home notices. The operator never buys the bigger transformer. Planned every two hours from the real weather, by thirty lines of code, not by the AI.

If asked how: "we pour the car charging into the night until it is flat, and let the batteries cut the dinner hill to the same level."

**5. Live demo (2:15 to 3:30).** Alt-tab to the board. Talk while clicking, never wait for a page.

1. Presentation tab, VIENNA chip:
   > Seventy-two transformers, two hundred seventy-two households, one of them real. Blue is with Gridzilla, grey is without, orange is the peak eaten.
2. The four tiles:
   > What the AI saw, what it chose, the rule check, the signed message.
3. Flattening tab, VIENNA, then one street:
   > Tonight's plan, for the city and for one street. Cars full by seven.
4. Presentation, pin Blatnica:
   > The real plant, live: grid, battery, charger, heat pump. Last reply verified.
5. Autopilot tab, pause heartbeat, wait for the red pill:
   > The operator goes dark. Every house goes back to normal. Nobody can hold your battery hostage.

   Resume. Back to the deck. If behind, skip Blatnica and keep the heartbeat.

**6. Real vs simulated (3:30 to 3:55).**

> Real: the whole path, a Victron plant and a Viessmann heat pump reacting to a signed message, the planning on the fleet. Simulated: the fleet, two thousand houses, same cars with and without, realistic charging. Measured tonight: one street thirty-one percent off its peak, Vienna with two thousand houses five megawatts off, a street where no car charged, zero.

**7. Close (3:55 to 4:20).**

> We need one street transformer to pilot on, this winter. Sign-up is two weeks, a second maker one week, we own the plant. After that: streets that keep their lights on from their own batteries when the line is gone. Gridzilla. It eats peaks for breakfast. Thank you.

Stop. Questions. The appendix covers production, security, makers, the six signals.

---

## Long version, twelve minutes

Kept for a longer slot. Same deck; the appendix slides come back into the flow in this order.

| time | slide | speaker | beat |
|---|---|---|---|
| 0:00 | 1 Title | M | Jingle, 30 s, say nothing. Then one sentence. |
| 0:45 | 2 Problem | M | Three numbers, three failure modes. |
| 1:45 | 3 The idea | M | The chain. Limits, not setpoints. Owner wins. |
| 2:30 | 4 Six signals | P | SUPPORT and ABSORB for every day, STRETCH as the vision. |
| 3:00 | 5 Household | M | One meter, one agent, any vendor. |
| 3:30 | 6 DeepSeek + guard | P | AI proposes, the guard disposes. |
| 4:15 | 7 The diet | P | Monster talk, then the algorithm in one breath. |
| 5:15 | 8 Real vs modelled | MT | Say it before they ask. |
| 6:00 | 9 Live demo | M + P | Board, Flattening tab, Blatnica, VRM, heartbeat. |
| 9:15 | 10 Built | M | Nothing is a mock-up. |
| 9:45 | 11 Vendors + incentives | MT | Simulators run no Victron code. Paid on the meter. |
| 10:30 | 12 Production | MT | Effort, cost, saving. |
| 11:15 | 13 Close | M | The ask. Stop talking. |
| appendix | A curve, B security | | Not presented. For questions. |

If you are behind at 6:00, the demo loses the Manual SUPPORT and the VRM window. Keep the Flattening tab and the heartbeat pause; those two are the story.

---

## Script

### 1. Title (0:00 to 0:45)

Click the speaker icon the moment the slide is up. Thirty seconds of trailer. Do not talk over it. When it cuts:

> Good afternoon. Gridzilla is a grid signal for home batteries, electric cars and heat pumps. The distribution operator sends it, the house decides how to follow it, and the owner can always say no. We have it running on a real plant in Slovakia tonight, and on a simulated Vienna of two thousand houses. Twelve minutes.

### 2. The problem (0:45 to 1:45)

> Europe's largest battery is in people's basements. Hundreds of thousands of home batteries, millions of cars with a plug, heat pumps in every new house. Together they are gigawatt hours of storage and gigawatts of flexible load. The grid can use exactly none of it.
>
> Three failure modes. In Slovakia there is no signal at all: the operator sees a transformer overload and sends a truck. In Germany the best case is paragraph 14a: a dimmer switch, the operator can cut a charger to 4.2 kilowatts and nothing else, no battery, no feed-in, no plan. In Ukraine three gigawatt hours of home storage sat in basements during the blackouts with zero coordination, because nobody had a way to ask them anything.
>
> The storage exists. The signal does not.

### 3. The idea (1:45 to 2:30)

> One signed, bounded signal. The operator says: for the next three hours, this street may import at most three kilowatts per house. Or: export at most two. Or: have your car full by seven. It never says "discharge now" and it never touches a setpoint. The house, with whatever hardware it has, decides how to meet the limit: battery first, car second, hot water third.
>
> The owner's own limits always win. The signal can tighten, it can never loosen. If the operator's platform goes silent, every house reverts to normal in two minutes. Enforcement is the meter: a limit is something a meter can check, a "please reduce" is not. Payment follows the meter.

### 4. Six signals (2:30 to 3:00)

> Six verbs, one grammar: limits for a window. The two you use every day are SUPPORT, "take three kilowatts only", and ABSORB, "export at most two, soak the sun into the car and the tank". PREPARE fills everything before a forecast event, RECOVER refills a street after an outage without a second blackout, RELEASE ends it.
>
> STRETCH is the vision: a dark street that keeps its lights on from its own basements, rationed by the same signal. That needs grid-forming inverters, which are arriving. The protocol already carries the verb for them.

### 5. The household (3:00 to 3:30)

> The unit is the household: everything behind one meter. One agent, eight functions, identical on every vendor; only one function, "apply the limit to my hardware", is the vendor's. On the Victron that is Node-RED on the Cerbo. On the Viessmann heat pump it is the ViCare API. On the simulators it is thirty lines of JavaScript. Same signature check, same owner limits, same acks.

### 6. DeepSeek and the guard (3:30 to 4:15)

> Who sends the signal? Every fifteen grid minutes a DeepSeek model, running on our own hardware, reads the forecast of every transformer, the weather, the state of the fleet, and proposes one signal or none, with a rationale. A deterministic guard checks it: window, depth, rate, owner floors, the real-device cooldown. If it passes, the platform signs and sends it. No human in the loop, and the guard is not AI; it is thirty lines of policy you can read.
>
> AI proposes, the guard disposes. Every decision is logged with its reasoning and the acks it earned. That log is the audit trail.

### 7. The diet (4:15 to 5:15)

> Now the fun part. Gridzilla eats peaks. But it is on a diet. It eats exactly the slice above a level L and not a watt more.
>
> Here is the algorithm in one breath. Forecast what nobody controls: the houses outside the program, the base load, the sun. Count the flexibility: the car charging that must be done by morning, the battery energy for the peak, the battery room for the noon sun. Then water-fill: find the lowest level where the cars fit in the valley below it and the peak above it fits in the batteries. That level is the flattest the street can physically be. Send it as two ceilings per house per fifteen minutes for the next twenty-four hours, renewed every two hours.
>
> What the house sees: a car plugged in at six trickles through dinner and gulps at two in the morning. A battery swallows the slice above L and gives it back to the house. At noon the monster drinks the solar surplus before the feeder sees it. Nobody notices. The transformer sleeps at seventy percent instead of one hundred and ten.

### 8. Real vs modelled (5:15 to 6:00)

> Before you ask: what is real and what is a simulation.
>
> Real: the signal path, end to end. A signed message goes out over a public broker, a Victron plant and a Viessmann heat pump move, verified acks come back. The algorithm and the guard are real and run on the fleet every two hours.
>
> Modelled: the fleet. Two hundred seventy-one simulated households, each standing for eight real ones, two thousand program houses, half of them with a car. The counterfactual is honest: the same houses with no signal, a car charges on fifty-five percent of nights, arrivals spread over three hours, full power until full. Measured tonight: one street, Speising, five hundred seventy-four kilowatts down to three hundred ninety-eight, thirty-one percent. Vienna with two thousand enrolled houses, twenty-six point six megawatts down to twenty-one point seven, nineteen percent. A street where no car charged tonight: zero. The gap is the cars and the batteries, nothing else.

### 9. Live demo (6:00 to 9:15)

Alt-tab to the board. Talk while you click; never wait for a page.

1. **City.** Presentation tab, VIENNA chip.
   > Seventy-two transformers, eight substations, two hundred seventy-two households live. The green strip at the bottom is every transformer's load. The curve: blue is what the city draws, grey dashed is what the same houses would draw without Gridzilla, orange is the peak eaten.
2. **One decision.** Point at the four tiles.
   > Sense: the forecast that triggered it. Decide: DeepSeek's signal and its reasoning, unabridged below. Guard: within policy. Signed: sequence number, Ed25519, on the wire. The countdown is the next review.
3. **Flattening tab.** Click it, VIENNA, then one street.
   > This is tonight's plan for the whole city, and here for one street: without, with, the level L, the peak eaten in orange, cars full by seven. Renewed every two hours from the real weather forecast.
4. **Blatnica.** Presentation tab, "pin Blatnica".
   > The real plant: grid power, battery, the eleven-kilowatt charger, the heat pump's tank, live from the Cerbo and from ViCare. The last ack and its signature check.
5. **Manual SUPPORT** (skip if behind). Manual tab, segment tf:atzgersdorf-1, SUPPORT, import 2 kW, 10 min, send. Back to Presentation.
   > Sent. Within seconds the Cerbo acks, the tiles move.
6. **VRM** (skip if behind). Alt-tab.
   > Victron's own portal, the same plant: grid setpoint and battery power reacting. The independent witness.
7. **Heartbeat.** Autopilot tab, "pause heartbeat". Wait for the pill to go red.
   > The operator's platform goes dark. Every house reverts to owner mode within two minutes. Nobody can hold your battery hostage. Resume.

Back to the deck.

### 10. Built (9:15 to 9:45)

> Everything on that screen runs on real infrastructure today: a public broker with Let's Encrypt, the platform on a server in Slovakia, the LLM on four DGX Sparks, the real plant on VRM, the heat pump on Viessmann's cloud. Two real devices, two vendors, zero mock-ups. The repository has the protocol, the platform, the agents, and this deck.

### 11. Vendors and incentives (9:45 to 10:30)

> Vendor independence is proven by the simulators: they run no Victron code and speak the same protocol. Three paths for any vendor: the vendor's cloud, a local agent, or a standards gateway. Four lines each.
>
> Why does a household join? A flat payment per year for being in the program, energy at crisis prices when the street takes it, and nothing they have to do. Paid only when the meter proves the limit was kept. No enforcement, no payment, no saving. That is the whole incentive design.

### 12. Production (10:30 to 11:15)

> What it takes at a real operator. The protocol and the agents are the small part; they exist. The operator adds enrolment bound to the meter point, a PKI with key rotation, settlement on meter data, its real network model, operations, compliance. A ten-house pilot on one transformer in three months. A district in twelve to eighteen months, six to eight people, one and a half to three million euros.
>
> Cost to run: two servers and a broker; the real cost is the incentive, one to two hundred euros per house per year. Saving: a street transformer is fifty to a hundred fifty thousand, a feeder hundreds of thousands, a substation tens of millions. Every street held at seventy percent defers the reinforcement the cars and heat pumps otherwise force this decade. Our numbers, not a quote. The shape is what matters.

### 13. Close (11:15 to 12:00)

> What we need: a street transformer to pilot on, this winter, with a Slovak or Austrian operator. Enrolment is two weeks of work, a second vendor is one week; we own the plant and the know-how to install it. The vision after that: streets that island on grid-forming inverters when the line is gone, rationed by the same signal.
>
> Gridzilla. It eats peaks for breakfast. Thank you.

Stop. Take questions.

---

## Windows, links, and what to show in each

Open all of them before the talk, logged in, each on its own desktop or browser window so alt-tab goes deck → board → VRM → Node-RED and back.

### 1. The deck
`docs/Gridzilla-pitch.pptx` in PowerPoint. Slide 1 has the jingle; test the sound through the room speakers.

### 2. Gridzilla board: https://gridzilla.victronlab.sk
One page, five tabs, nothing to log in to. The tab you were on is remembered per browser.

| tab | when | what to show |
|---|---|---|
| **Presentation** | demo steps 1, 2, 4 | City strip, the four decision tiles, the with/without curve, the Blatnica live panel. Chips: VIENNA, a substation, a feeder; click a green cell for one street. "follow autopilot" keeps the curve on whatever DeepSeek last addressed; "pin Blatnica" keeps it on our street. The header line says the simulated time of day and the last signal, even an ended one. |
| **Flattening** | demo step 3 | Tonight's 24 h diet plan: grey dashed without, blue with, orange eaten, the level L. VIENNA first, then a feeder, then one street. The five tiles: peak without, peak with, eaten, car charging moved, noon export level. The four steps of the algorithm and the monster line on the right. |
| **Autopilot** | demo step 7 | The loop as a schematic, the latest decisions with full rationale, the envelope curves, the "Review now" button, the scenario buttons (Normal, Cold evening, Sunny noon, Live weather) and **"pause heartbeat"** for the revert demo. Resume it afterwards. |
| **Manual** | demo step 5 | The signal composer: segment, mode, fields, window. For the demo: `tf:atzgersdorf-1`, SUPPORT, import_max_kw 2, 10 minutes. The log below shows the guard verdict, the signature and every ack. |
| **Households** | only if asked | Every house with SoC, grid, EV, heat pump, tank, mode, diet-plan flag, filtered by the selected feeder or all 272. |

APIs behind it, if a juror wants raw data: `/api/state`, `/api/history?nodes=tf:speising-22`, `/api/flatten?node=feeder:liesing-3`, `/api/weather`, `/api/devices`.

### 3. VRM: https://vrm.victronenergy.com
Log in with the victronlab account, open the Blatnica installation (portal id `c0619ab3794e`). Show the **Dashboard** with the live flow diagram: grid, battery, PV, loads, EV charger. During the Manual SUPPORT step the grid setpoint and battery power move within seconds. Also useful: **Advanced** → "Grid" and "Battery power" widgets for the last hour, to show the step. VRM is the independent witness: Victron's own portal, not our page.

### 4. Node-RED on the Cerbo
Two ways in:
- From VRM: installation → **Venus OS Large** → **Node-RED** (the remote editor through VRM; works from the venue network).
- On the site LAN or over the tailnet: https://192.168.90.147:1881 (self-signed cert, user `admin`).

Open the tab **"Gridzilla agent"**. What to show, one sentence each: the MQTT-in node subscribed to our path (`region:at`, `sub:wien-sued`, `feeder:liesing-3`, `tf:atzgersdorf-1`), the **verify** function (signature, sequence, window, path), the **merge** function (owner limits, `effective = tighter(signal, owner)`), the Victron output nodes that write ESS settings and the EV charger current, the watchdog that reverts after 120 s without a heartbeat, and the **ack** out to `gridzilla/ack/real-powerplant-blatnica`. Do not deploy anything during the talk; the user's own "MaxInverterPower" tab is not ours, leave it alone.

Show Node-RED only if asked how the device side works, or in the Q&A. It is the proof that the vendor-specific part is a handful of nodes.

### 5. GitHub: https://github.com/mathewstars/Gridzilla
`protocol/PROTOCOL.md` for the signal spec, `platform/flatten.py` for the algorithm, `agent/` for the three agents (simulator, Node-RED flow, ViCare), `docs/` for this guide, the deck and the architecture page.

### 6. Architecture page: https://claude.ai/artifact/EKMwWEAfzeujPU5DGsgVpi
The long-form version: problem, signals, the diet plan, resilience, enforcement, the Victron control plane, threats and controls. For jurors who read afterwards.

---

## Questions you will get, and the short answers

- **Who guarantees the house follows the limit?** The meter. Payment follows the measured fifteen-minute interval. A cap costs the owner nothing, so there is no reason to cheat; forced feed-in is paid per kWh.
- **What if the owner switches it off?** They can, any time. They stop being paid. That is the design, not a gap.
- **Why not just use paragraph 14a?** 14a is a dimmer on one device. Gridzilla is a limit on the connection point that the whole house meets together, plus export, plus a plan, plus payment.
- **Is DeepSeek safe to run a grid?** It only proposes. The guard is deterministic policy, thirty lines. Every proposal is logged with its reasoning. Turn the model off and the flattening plan keeps running without it.
- **How do you know your network model?** We do not; the operator does. Enrolment binds a meter point, the tree comes from their GIS.
- **Isn't the 5 MW a simulation?** Yes. The street numbers are measured on a simulated fleet with an honest counterfactual and sit inside published pilots. The city number is the street effect times enrolment.
- **What about islanding a street?** Needs grid-forming inverters. Today PREPARE and RECOVER are the outage tools; STRETCH is the vision for the hardware that is arriving.
- **Security of the platform itself?** Appendix slide B: the device accepts only signed, sequenced, windowed signals for its own path, reverts on silence, and the owner's limits cannot be loosened. The platform's own hardening is the operator's standard IT problem.

## Checklist, 30 minutes before

- Board loads in under three seconds, clock says "sim", heartbeat green, 271 on the diet plan in the city hint.
- Autopilot tab: mode is "autonomous", "Review now" works.
- Blatnica tiles update, last ack "applied" with a signature check.
- VRM logged in, Blatnica plant open on the dashboard.
- Deck opened in PowerPoint (not the PDF), slide 1 speaker icon plays sound through the room speakers.
- Nobody restarts anything on turboprop after this point.
