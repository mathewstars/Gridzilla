// Presenter notes (N key, off by default): one short line per build step, from the run of show (firstmate
// data/gz-ui/pitch-script.md). The overlay shows only the current step's line; a key badge marks that another beat
// follows on the same slide. The slides show only what belongs on a slide; the speaker says the rest.
export interface Notes {
  who: string;
  time: string;
  /** What to say on each build step of the slide, in order. */
  steps: string[];
}

// Index = slide number: 0 the trailer, 1 title, 2 problem, 3 idea, 4 six words, 5 monster, 6 demo, 7 real vs simulated,
// 8 close, 9 end.
export const NOTES: Notes[] = [
  {
    who: "Matthew",
    time: "0:00, 32 s",
    steps: ["Before you walk up: F for full screen, 2 for the cold evening. Space plays the trailer; say nothing until the title."],
  },
  { who: "Matthew", time: "0:30", steps: ["Flat: Now you probably wonder what the monster really is."] },
  {
    who: "Matthew",
    time: "0:30, 20 s",
    steps: [
      "Slowly: six in the evening, a street in Vienna. The transformer is at a hundred and ten percent. Nobody knows. The batteries are full. Nobody has asked them.",
      "It is a grid signal that home batteries, cars and heat pumps follow. Slovakia: no signal. Germany: a dimmer on one device. Ukraine: three gigawatt hours idle. The storage exists. The signal does not.",
    ],
  },
  {
    who: "Matthew",
    time: "0:50, 20 s",
    steps: [
      "One message does the whole job. Every box reads the same line and sorts it out by itself: battery first, car second, hot water third. The operator asks, the house decides, the owner can always say no.",
      "Every fifteen minutes the AI reads the city and writes the message. Thirty lines of rules check it, the platform signs it, the houses reply, signed.",
    ],
  },
  {
    who: "Matthew",
    time: "1:10, 15 s",
    steps: [
      "The message has six words. Support at the evening peak, absorb at noon, prepare before a storm, stretch when the street is dark, recover when it comes back, release when it is over. Plus the 24-hour diet plan. Each one signed, each with a time window, and the owner's limits always win.",
    ],
  },
  {
    who: "Peter",
    time: "1:25, 30 s",
    steps: [
      "Gridzilla eats peaks, every street, every evening. At six the cars come home and the transformer would go past its limit; with Gridzilla it stays well under. Cars and heat pumps move into the night, every car full by seven.",
    ],
  },
  {
    who: "Matthew",
    time: "1:55, 60 s",
    steps: [
      "This is one street in Vienna, tonight, live. Talk while it runs; never wait for the screen.",
      "The curve: with Gridzilla against without, the limit, tonight's plan, the peak it eats.",
      "The ring: how full this transformer is right now.",
      "The AI saw the peak coming, wrote the message in about a second; the rules checked it, the platform signed and sent it.",
      "A limit for a limited time: every message runs out by itself.",
      "The whole city: colour is how close each transformer is to its limit. Most need no upgrade tonight.",
      "What just happened: signed messages out, signed replies back. Any brand can join.",
      "Peter pauses the operator on the board: every house is back to owner mode within two minutes.",
    ],
  },
  {
    who: "Dad",
    time: "2:55, 25 s",
    steps: [
      "Real: our family home in Blatnica, live right now, following a signed message. Simulated: two thousand houses, the same cars with and without. Tonight, with the heat pumps too: thirty-six percent off one street, five megawatts off Vienna.",
    ],
  },
  {
    who: "Matthew",
    time: "3:20, 25 s",
    steps: [
      "We need one street transformer to pilot on, this winter. So at six tomorrow, when the cars come home, the batteries answer before anyone notices.",
      "Gridzilla. It eats peaks for breakfast. Thank you.",
    ],
  },
  { who: "Matthew", time: "3:42", steps: ["Stop at 3:50. Questions."] },
];
