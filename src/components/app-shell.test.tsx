// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./app-shell";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("AppShell", () => {
  it("muestra 'Token activo' cuando hasToken", () => {
    render(<AppShell hasToken>contenido</AppShell>);
    expect(screen.getByText("Token activo")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("muestra 'Sin token' por defecto", () => {
    render(<AppShell>x</AppShell>);
    expect(screen.getByText("Sin token")).toBeInTheDocument();
  });
});
