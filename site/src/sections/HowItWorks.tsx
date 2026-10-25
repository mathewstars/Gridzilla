// STUB (helper A): how it works. Sticky split, four steps on the left, the paired console screenshot on the right
// (public/shots/step-signal.webp, step-plan.webp, step-plant.webp, step-log.webp). Spec section 4.
import { Section, Title } from "../ui/Section";

export const STEPS = [
  { title: "The operator signs a limit.", body: "“This street, next three hours, at most three kilowatts import per house.” Signed with Ed25519, scoped to one segment and one time window.", shot: "shots/step-signal.webp" },
  { title: "Every house checks it.", body: "One agent per home verifies the signature, the sequence and the validity window, then merges the limit with the owner’s own limits. The owner always wins.", shot: "shots/step-plan.webp" },
  { title: "The hardware follows, in order.", body: "Battery first, then the car, hot water, floor heating. A Node-RED flow on a Victron Cerbo GX, the ViCare API on a Viessmann heat pump, thirty lines of JavaScript in the simulators.", shot: "shots/step-plant.webp" },
  { title: "A signed answer comes back.", body: "Acks are honest: “applied” or “partial”, never pretend. When the window ends or the heartbeat stops, everything reverts.", shot: "shots/step-log.webp" },
];

export default function HowItWorks() {
  return (
    <Section id="how">
      <Title>How it works</Title>
      <ol className="mt-12 grid list-none gap-10 p-0">
        {STEPS.map((s) => (
          <li key={s.title}>
            <h3 className="m-0 text-[24px] font-semibold">{s.title}</h3>
            <p className="mt-3 max-w-[52ch] text-secondary">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
