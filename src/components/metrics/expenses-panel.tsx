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
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ResponsiveTable } from "@/components/responsive-table"
import { MetricCard } from "@/components/metrics/metric-card"
import { useMetrics } from "@/components/metrics/metrics-store"
import {
  METRICS_DIALOG,
  METRICS_DIALOG_HEADER,
  METRICS_EXPENSE_FADE,
  METRICS_EXPENSE_PIN,
  METRICS_FIELD,
  METRICS_FOOTER,
  METRICS_ICON,
  METRICS_SHEET,
  METRICS_SHEET_HANDLE,
  METRICS_SHEET_HEADER,
  METRICS_SORT_HEAD,
  METRICS_TOUCH,
} from "@/components/metrics/responsive"
import {
  CELL,
  HEAD,
  Pill,
  SortableHead,
  TableCard,
} from "@/components/table-bits"
import { useMetricsSheetTabTrap } from "@/components/metrics/sheet-tab-trap"

function ExpenseForm({
  header,
  category,
  setCategory,
  amount,
  setAmount,
  date,
  setDate,
  recurring,
  setRecurring,
  period,
  valid,
  onCancel,
  onSubmit,
}: {
  header: React.ReactNode
  category: string
  setCategory: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  date: string
  setDate: (v: string) => void
  recurring: boolean
  setRecurring: (v: boolean) => void
  period: { start: string; end: string }
  valid: boolean
  onCancel: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {header}
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-caption font-medium">Category</span>
          <Input
            autoFocus
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Vercel"
            aria-label="Category"
            className={METRICS_FIELD}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
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
              className={METRICS_FIELD}
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
              className={METRICS_FIELD}
            />
          </label>
        </div>
        <label className="text-body flex items-center gap-2.5 pt-1 max-xl:min-h-11!">
          {/* Base UI names the switch from the wrapping label. */}
          <Switch
            checked={recurring}
            onCheckedChange={(checked) => setRecurring(Boolean(checked))}
            className="max-xl:min-h-11! max-xl:min-w-11!"
          />
          Recurring
        </label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className={METRICS_FOOTER}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid} className={METRICS_FOOTER}>
          Add expense
        </Button>
      </DialogFooter>
    </form>
  )
}

function AddExpenseDialog() {
  // Dates come from the store's clock (the request's day, or the day of a
  // Reset) — never the machine's. The default is taken when the dialog
  // opens, so it follows a Reset that moved the day.
  const { today, addExpense } = useMetrics()
  const phone = useIsMobile()
  const period = periodEnding(today)
  const [open, setOpen] = React.useState(false)
  useMetricsSheetTabTrap(phone && open)
  const [category, setCategory] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState(today)
  const [recurring, setRecurring] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

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

  function openDialog(next: boolean) {
    if (next) setDate(today)
    else reset()
    setOpen(next)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    addExpense({ category, amount: amountNumber, date, recurring })
    reset()
    setOpen(false)
  }

  const fields = {
    category,
    setCategory,
    amount,
    setAmount,
    date,
    setDate,
    recurring,
    setRecurring,
    period,
    valid,
    onCancel: () => {
      reset()
      setOpen(false)
    },
    onSubmit: submit,
  }

  const description = (
    <>
      Adds a row to the table and moves the Expenses card. Dates must fall in
      the current period ({formatPeriod(period)}). Saved in this browser only.
    </>
  )

  if (phone) {
    return (
      <>
        <Button
          ref={triggerRef}
          size="sm"
          className={`h-9 px-3.5 ${METRICS_TOUCH}`}
          onClick={() => openDialog(true)}
        >
          <PlusIcon aria-hidden />
          Add expense
        </Button>
        <Sheet open={open} onOpenChange={openDialog}>
          <SheetContent
            side="bottom"
            className={METRICS_SHEET}
            finalFocus={triggerRef}
          >
            <div aria-hidden className={METRICS_SHEET_HANDLE} />
            <ExpenseForm
              {...fields}
              header={
                <SheetHeader className={METRICS_SHEET_HEADER}>
                  <SheetTitle>Add expense</SheetTitle>
                  <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
              }
            />
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger
        render={
          <Button size="sm" className={`h-9 px-3.5 ${METRICS_TOUCH}`}>
            <PlusIcon aria-hidden />
            Add expense
          </Button>
        }
      />
      <DialogContent className={METRICS_DIALOG}>
        <ExpenseForm
          {...fields}
          header={
            <DialogHeader className={METRICS_DIALOG_HEADER}>
              <DialogTitle>Add expense</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
          }
        />
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
        <div className="relative">
          <ResponsiveTable className={METRICS_EXPENSE_PIN}>
            <Table aria-label="Expenses">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead
                    column="category"
                    sort={sort}
                    onSort={onSort}
                    className={METRICS_SORT_HEAD}
                  >
                    Category
                  </SortableHead>
                  <SortableHead
                    column="amount"
                    sort={sort}
                    onSort={onSort}
                    align="right"
                    className={METRICS_SORT_HEAD}
                  >
                    Amount
                  </SortableHead>
                  <SortableHead
                    column="date"
                    sort={sort}
                    onSort={onSort}
                    className={METRICS_SORT_HEAD}
                  >
                    Date
                  </SortableHead>
                  <SortableHead
                    column="recurring"
                    sort={sort}
                    onSort={onSort}
                    className={METRICS_SORT_HEAD}
                  >
                    Recurring
                  </SortableHead>
                  <th className={`${HEAD} w-10 max-xl:w-11`}>
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
                          className={cn(
                            "text-muted-foreground opacity-40 group-hover/row:opacity-100 hover:opacity-100 focus-visible:opacity-100 max-xl:opacity-100 max-xl:focus-visible:ring-inset",
                            METRICS_ICON
                          )}
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ResponsiveTable>
          <div data-testid="metrics-expenses-fade" className={METRICS_EXPENSE_FADE} />
        </div>
      </TableCard>
    </div>
  )
}
