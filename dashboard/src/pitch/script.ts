// Presenter notes (N key): the lines from the run of show (firstmate data/gz-ui/pitch-script.md), one entry per slide.
// The slides show only what belongs on a slide; the speaker says the rest.
export interface Notes {
  who: string;
  time: string;
  lines: string[];
  /** What the next key press does on this slide, when it is not simply "next slide". */
  keys?: string;
}

export const NOTES: Notes[] = [
  {
    who: "Matthew",
    time: "0:00, 30 s",
    lines: [
      "Before you walk up: press F for full screen and 2 for the cold evening, so the peak is already building.",
      "Press Space: the trailer plays with its sound for 30 seconds. Say nothing.",
      "At its last frame the deck cuts to the title by itself.",
    ],
    keys: "Space plays the trailer. A press while it plays skips to the title.",
  },
  {
    who: "Matthew",
    time: "0:30, 2 s",
    lines: ["Right after the cut, flat: Now you probably wonder what the monster really is."],
  },
  {
    who: "Matthew",
    time: "0:30, 25 s",
    lines: [
      "It is a grid signal that home batteries, cars and heat pumps follow.",
      "Europe's largest battery is in people's basements. The grid can use none of it.",
      "Slovakia has no signal at all. Germany has a dimmer switch on one device. Ukraine had three gigawatt hours of home storage sitting idle through the blackouts.",
      "The storage exists. The signal does not.",
    ],
  },
  {
    who: "Matthew",
    time: "0:55, 40 s",
    lines: [
      "One message does the whole job.",
      "\"This street, next three hours, take at most three kilowatts per house.\"",
      "Every box under it reads the same line. The Victron, the GoodWe, the Viessmann, the car charger. Each one sorts it out by itself. Battery first, car second, hot water third.",
      "(Right) Same message at noon: \"give at most two.\" The sun goes into the batteries instead of the feeder.",
      "The operator only ever sends a limit. Never a command. The house decides. The owner can always say no.",
      "(Right) Every fifteen minutes the AI reads the whole city. Seventy-two transformers, the weather, the plan, every house's reply.",
      "It writes the message. Thirty lines of rules check it. The platform signs it. The houses reply, signed.",
    ],
    keys: "Right: the same message at noon. Right: the loop. Next press goes to the peaks.",
  },
  {
    who: "Peter",
    time: "1:35, 40 s",
    lines: [
      "Gridzilla eats peaks. Every street, every evening.",
      "At six the cars come home and the transformer would hit a hundred and ten percent. With Gridzilla it stays at seventy.",
      "The cars still charge, just not at dinner. Plugged in at six, trickle through the evening, full by seven in the morning.",
      "The batteries eat the dinner spike. The noon sun fills them again.",
      "Nobody at home notices. The operator never buys the bigger transformer.",
      "Planned every two hours from the real weather. Thirty lines of code, not the AI.",
    ],
  },
  {
    who: "Matthew",
    time: "2:15, 75 s",
    lines: [
      "0-15 s, ring and big number: This is one street in Vienna, tonight, live. Without us this transformer goes past its limit. The number is what we are taking off it right now. The black line is with Gridzilla. Grey is without. Green is tonight's plan. The shaded part is the energy we moved.",
      "15-30 s, the strip: All the homes on this street follow the plan. Zero kilowatts over any limit, so nobody gets cut off. Most of the city's transformers need no upgrade tonight. Any brand can join. It is an open profile, and every reply is signed.",
      "30-45 s, the four AI steps: The AI saw the peak coming. It wrote the message in about a second. The rules checked it. The platform signed it and sent it. A person can take over at any time.",
      "45-60 s, press 3: Same street at noon. Same kind of message, other direction. The solar goes into the batteries instead of back up the feeder.",
      "60-75 s, Peter pauses the operator on the board: Now the operator goes dark. Every house goes back to normal within two minutes. Nobody can hold your battery hostage.",
      "If behind: skip the noon step.",
    ],
    keys: "1-4 scenarios, the stage's own keys work. Left/Right still move slides.",
  },
  {
    who: "Dad",
    time: "3:30, 25 s",
    lines: [
      "Real: the whole path. A Victron plant and a Viessmann heat pump in Slovakia reacting to a signed message. The planning runs on the fleet.",
      "Simulated: the fleet. Two thousand houses, the same cars with and without, realistic charging.",
      "Measured: one street thirty-one percent off its peak. Vienna with two thousand houses, five megawatts off. A street where no car charged, zero.",
    ],
  },
  {
    who: "Matthew",
    time: "3:55, 25 s",
    lines: [
      "We need one street transformer to pilot on. This winter.",
      "Sign-up is two weeks. A second maker, one week. We own the plant.",
      "After that: streets that keep their lights on from their own batteries when the line is gone.",
      "(Right) Gridzilla. It eats peaks for breakfast. Thank you.",
      "Stop at 4:20. Questions.",
    ],
    keys: "Right shows the last line alone.",
  },
];
