"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { formatDate, formatPeriod, inPeriod, periodEnding } from "@/lib/clock"
import {
  formatCurrency,
  sortRows,
  toggleSort,
  type Expense,
  type Sort,
} from "@/lib/metrics"
import { METRIC_DEFS, snapshotFor } from "@/lib/kpis"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MetricCard } from "@/components/metrics/metric-card"
import { useMetrics } from "@/components/metrics/metrics-store"
import {
  CELL,
  HEAD,
  Pill,
  SortableHead,
  TableCard,
} from "@/components/table-bits"

function AddExpenseDialog() {
  // Default to the page's "today" (read once per request), not the machine's.
  const { today, addExpense } = useMetrics()
  const period = periodEnding(today)
  const [open, setOpen] = React.useState(false)
  const [category, setCategory] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState(today)
  const [recurring, setRecurring] = React.useState(false)

  const amountNumber = Number(amount)
  // Whole dollars from $1, dated inside the period the card reports on.
  const valid =
    category.trim().length > 0 &&
    Number.isFinite(amountNumber) &&
    amountNumber >= 1 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    inPeriod(date, period)

  function reset() {
    setCategory("")
    setAmount("")
    setDate(today)
    setRecurring(false)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    addExpense({ category, amount: amountNumber, date, recurring })
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" className="h-9 px-3.5">
            <PlusIcon aria-hidden />
            Add expense
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md!">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>
              Adds a row to the table and moves the Expenses card. Dates must fall in
              the current period ({formatPeriod(period)}). Saved in this browser only.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-caption font-medium">Category</span>
              <Input
                autoFocus
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Vercel"
                aria-label="Category"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-caption font-medium">Amount (USD)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  aria-label="Amount"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-caption font-medium">Date</span>
                <Input
                  type="date"
                  min={period.start}
                  max={period.end}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                />
              </label>
            </div>
            <label className="text-body flex items-center gap-2.5 pt-1">
              {/* Base UI names the switch from the wrapping label. */}
              <Switch
                checked={recurring}
                onCheckedChange={(checked) => setRecurring(Boolean(checked))}
              />
              Recurring
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                setOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Add expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ExpenseKey = keyof Omit<Expense, "id">

export function ExpensesPanel() {
  const { today, expenses, charts, setChart, removeExpense } = useMetrics()
  const snapshot = snapshotFor("expenses", { today, expenses })
  const [sort, setSort] = React.useState<Sort<ExpenseKey> | null>({
    key: "amount",
    dir: "desc",
  })
  const sorted = sortRows(expenses, sort)
  const onSort = (key: ExpenseKey) =>
    setSort((s) => toggleSort(s, key, key === "category" ? "asc" : "desc"))

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <MetricCard
          snapshot={snapshot}
          chart={charts.expenses ?? METRIC_DEFS.expenses.defaultChart}
          onChartChange={(chart) => setChart("expenses", chart)}
          className="w-full max-w-[420px]"
        />
        <AddExpenseDialog />
      </div>

      <TableCard note="Seed rows are illustrative; rows you add are saved in this browser.">
        <Table aria-label="Expenses">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead column="category" sort={sort} onSort={onSort}>
                Category
              </SortableHead>
              <SortableHead column="amount" sort={sort} onSort={onSort} align="right">
                Amount
              </SortableHead>
              <SortableHead column="date" sort={sort} onSort={onSort}>
                Date
              </SortableHead>
              <SortableHead column="recurring" sort={sort} onSort={onSort}>
                Recurring
              </SortableHead>
              <th className={`${HEAD} w-10`}>
                <span className="sr-only">Actions</span>
              </th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className={`${CELL} text-muted-foreground py-8 text-center`}>
                  No expenses yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((e) => (
                <TableRow key={e.id} className="group/row hover:bg-transparent">
                  <TableCell className={CELL}>{e.category}</TableCell>
                  <TableCell className={`${CELL} text-right tabular-nums`}>
                    {formatCurrency(e.amount)}
                  </TableCell>
                  <TableCell className={CELL}>{formatDate(e.date)}</TableCell>
                  <TableCell className={CELL}>
                    <Pill tone={e.recurring ? "good" : "muted"}>
                      {e.recurring ? "Yes" : "No"}
                    </Pill>
                  </TableCell>
                  <TableCell className={`${CELL} py-2 pr-3 pl-0 text-right`}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${e.category}`}
                      title="Remove this expense"
                      onClick={() => removeExpense(e.id)}
                      className="text-muted-foreground opacity-40 group-hover/row:opacity-100 hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  )
}
