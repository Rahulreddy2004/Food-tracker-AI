import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CalorieRing, MacroBars } from "@/components/nutrition";
import { PortionEditor } from "@/components/PortionEditor";

describe("CalorieRing", () => {
  it("describes what's left for screen readers", () => {
    render(<CalorieRing eaten={1200} target={2000} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/1,200 of 2,000 kcal eaten, 800 left/);
  });

  it("says when you're over, not just with colour", () => {
    render(<CalorieRing eaten={2300} target={2000} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/300 over your goal/);
    expect(screen.getByText("Over goal")).toBeInTheDocument();
  });
});

describe("MacroBars", () => {
  it("exposes each macro as a progress bar", () => {
    render(
      <MacroBars
        totals={{ kcal: 900, proteinG: 60, carbsG: 100, fatG: 30 }}
        targets={{ kcal: 2000, proteinG: 120, carbsG: 250, fatG: 70 }}
      />,
    );
    const protein = screen.getByRole("progressbar", { name: "Protein" });
    expect(protein).toHaveAttribute("aria-valuenow", "60");
    expect(protein).toHaveAttribute("aria-valuemax", "120");
  });
});

describe("PortionEditor", () => {
  function Harness() {
    const [grams, setGrams] = useState(200);
    return (
      <>
        <PortionEditor grams={grams} onChange={setGrams} servingG={200} servingLabel="slice" />
        <output>{grams}</output>
      </>
    );
  }

  it("serving shortcuts and typing both change the portion", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "½× slice" }));
    expect(screen.getByText("100", { selector: "output" })).toBeInTheDocument();
    const input = screen.getByLabelText("Portion");
    await user.clear(input);
    await user.type(input, "250");
    expect(screen.getByText("250", { selector: "output" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1× slice" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
