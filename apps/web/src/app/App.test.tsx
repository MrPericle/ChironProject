import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the project shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Chiron Project" })).toBeInTheDocument();
    expect(screen.getByText("Catalogo corsi")).toBeInTheDocument();
    expect(screen.getByText("Backoffice")).toBeInTheDocument();
  });
});

