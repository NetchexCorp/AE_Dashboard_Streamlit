import { createColumnHelper } from "@tanstack/react-table";
import { fireEvent, render, cleanup, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DataTable } from "./DataTable";

interface Row {
  manager: string;
  ae: string;
  bookings: number | null;
}

const helper = createColumnHelper<Row>();
const columns = [
  helper.accessor("ae", { id: "ae", header: "AE", meta: { aggregate: "none", width: "12rem" } }),
  helper.accessor("manager", { id: "manager", header: "Mgr", meta: { aggregate: "none", width: "8rem" } }),
  helper.accessor("bookings", {
    id: "bookings",
    header: "Bookings",
    aggregationFn: "sum",
    meta: { aggregate: "sum", format: "currency", align: "right", width: "7rem" },
  }),
] as never[];

const data: Row[] = [
  { manager: "Anna", ae: "Alec", bookings: 100 },
  { manager: "Anna", ae: "Sarah", bookings: 200 },
  { manager: "Jeff", ae: "Bill", bookings: 300 },
];

afterEach(cleanup);

test("sort + group-toggle interactions do not trigger an update loop", () => {
  // Persisting view prefs inside a state updater triggers React's
  // "Cannot update a component while rendering a different component" warning
  // and an update loop. Fail loudly if that regresses.
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  const { container, getByText } = render(
    <DataTable data={data} columns={columns} groupBy="manager" tableId="loop-test" />,
  );
  const thead = container.querySelector("thead")!;
  // Click the sortable "Bookings" header → onSortingChange → persist effect.
  fireEvent.click(within(thead).getByText("Bookings"));
  fireEvent.click(within(thead).getByText("Bookings"));
  // Toggle manager grouping off → setGroupedToggle → persist effect.
  fireEvent.click(getByText("Group by manager"));

  expect(container.querySelector("table")).toBeTruthy();
  const badCall = errorSpy.mock.calls.find((args) =>
    String(args[0]).includes("Cannot update a component"),
  );
  expect(badCall, "setState-during-render warning regressed").toBeUndefined();
  errorSpy.mockRestore();
});
