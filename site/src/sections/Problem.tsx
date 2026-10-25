// STUB (helper A): the problem. Editorial statement + the real with/without chart for one street, full width.
// Spec section 3 (data/gz-site/spec.md). Real copy below; the chart data goes in src/data/street.ts.
import { Section, Title } from "../ui/Section";

export default function Problem() {
  return (
    <Section id="problem">
      <Title className="max-w-[22ch]">Home batteries are now the largest storage fleet in Europe. The grid operator cannot see or use a single one.</Title>
      <p className="t-lead mt-8 max-w-[52ch] text-secondary">
        At six in the evening the street transformer hits its rating. Today the operator can only curtail solar, cut the street, or buy a bigger transformer.
      </p>
      <p className="mt-10 text-[15px] text-secondary">One street, 511 to 325 kW at the evening peak. Same cars, same weather, one signal.</p>
    </Section>
  );
}
