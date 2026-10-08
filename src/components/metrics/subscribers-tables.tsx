"use client"

import * as React from "react"

import { formatDate } from "@/lib/clock"
import {
  formatCurrency,
  sortRows,
  toggleSort,
  type ChurnedSubscriber,
  type NewSubscriber,
  type Plan,
  type Sort,
} from "@/lib/metrics"
import { seedChurnedSubscribers, seedNewSubscribers } from "@/lib/kpis"
import { useMetrics } from "@/components/metrics/metrics-store"
import {
  METRICS_SORT,
  METRICS_SORT_HEAD,
  METRICS_TOUCH,
} from "@/components/metrics/responsive"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ResponsiveTable, RowCollapse } from "@/components/responsive-table"
import {
  CELL,
  Pill,
  SortableHead,
  TableCard,
  Who,
} from "@/components/table-bits"

const PLAN_TONE: Record<Plan, "plan" | "annual" | "muted"> = {
  Monthly: "plan",
  Annual: "annual",
  Staff: "muted",
}

type NewKey = "name" | "plan" | "signupDate"

const NEW_SORT_LABEL: Record<NewKey, string> = {
  name: "Name",
  plan: "Plan",
  signupDate: "Signup date",
}

function SortMenu<K extends string>({
  keys,
  labels,
  sort,
  onSort,
  label,
}: {
  keys: readonly K[]
  labels: Record<K, string>
  sort: Sort<K> | null
  onSort: (key: K) => void
  label: string
}) {
  const current = sort ? labels[sort.key] : "Default"
  return (
    <div className={METRICS_SORT}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className={`h-9 px-3.5 ${METRICS_TOUCH}`}>
              Sort: {current}
            </Button>
          }
        />
        <DropdownMenuContent align="end" aria-label={label}>
          {keys.map((key) => (
            <DropdownMenuItem
              key={key}
              onClick={() => onSort(key)}
              className="max-xl:min-h-11!"
            >
              {labels[key]}
              {sort?.key === key ? (sort.dir === "asc" ? " · A–Z" : " · Z–A") : ""}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function NewSubscribersTable({ rows }: { rows?: NewSubscriber[] }) {
  const { today } = useMetrics()
  const data = rows ?? seedNewSubscribers(today)
  const [sort, setSort] = React.useState<Sort<NewKey> | null>({
    key: "signupDate",
    dir: "desc",
  })
  const sorted = sortRows(data, sort)
  const onSort = (key: NewKey) =>
    setSort((s) => toggleSort(s, key, key === "signupDate" ? "desc" : "asc"))

  return (
    <TableCard note="Illustrative sign-ups, not real customers.">
      <SortMenu
        keys={["name", "plan", "signupDate"] as const}
        labels={NEW_SORT_LABEL}
        sort={sort}
        onSort={onSort}
        label="Sort new subscribers"
      />
      <ResponsiveTable
        layout="stack"
        stacked={sorted.map((s) => (
          <RowCollapse
            key={s.id}
            title={s.name}
            status={<Pill tone={PLAN_TONE[s.plan]}>{s.plan}</Pill>}
            sample
            meta={[
              { label: "Email", value: s.email },
              { label: "Signup date", value: formatDate(s.signupDate) },
            ]}
          />
        ))}
      >
        <Table aria-label="New subscribers">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead column="name" sort={sort} onSort={onSort} className={METRICS_SORT_HEAD}>
                Name / Email
              </SortableHead>
              <SortableHead column="plan" sort={sort} onSort={onSort} className={METRICS_SORT_HEAD}>
                Plan
              </SortableHead>
              <SortableHead
                column="signupDate"
                sort={sort}
                onSort={onSort}
                className={METRICS_SORT_HEAD}
              >
                Signup Date
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => (
              <TableRow key={s.id} className="hover:bg-transparent">
                <TableCell className={CELL}>
                  <Who name={s.name} email={s.email} />
                </TableCell>
                <TableCell className={CELL}>
                  <Pill tone={PLAN_TONE[s.plan]}>{s.plan}</Pill>
                </TableCell>
                <TableCell className={CELL}>{formatDate(s.signupDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResponsiveTable>
    </TableCard>
  )
}

type ChurnKey = "name" | "signupDate" | "churnDate" | "lifetimeValue"

const CHURN_SORT_LABEL: Record<ChurnKey, string> = {
  name: "Name",
  signupDate: "Signup date",
  churnDate: "Churn date",
  lifetimeValue: "Lifetime value",
}

export function ChurnedSubscribersTable({ rows }: { rows?: ChurnedSubscriber[] }) {
  const { today } = useMetrics()
  const data = rows ?? seedChurnedSubscribers(today)
  const [sort, setSort] = React.useState<Sort<ChurnKey> | null>({
    key: "churnDate",
    dir: "desc",
  })
  const sorted = sortRows(data, sort)
  const onSort = (key: ChurnKey) =>
    setSort((s) => toggleSort(s, key, key === "name" ? "asc" : "desc"))

  return (
    <TableCard note="Illustrative churn, not real customers.">
      <SortMenu
        keys={["name", "signupDate", "churnDate", "lifetimeValue"] as const}
        labels={CHURN_SORT_LABEL}
        sort={sort}
        onSort={onSort}
        label="Sort churned subscribers"
      />
      <ResponsiveTable
        layout="stack"
        stacked={sorted.map((s) => (
          <RowCollapse
            key={s.id}
            title={s.name}
            status={<Pill tone="muted">{formatCurrency(s.lifetimeValue)}</Pill>}
            sample
            meta={[
              { label: "Email", value: s.email },
              {
                label: "Signup / churn date",
                value: `${formatDate(s.signupDate)} → ${formatDate(s.churnDate)}`,
              },
            ]}
          />
        ))}
      >
        <Table aria-label="Churned subscribers">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead column="name" sort={sort} onSort={onSort} className={METRICS_SORT_HEAD}>
                Name / Email
              </SortableHead>
              <SortableHead
                column="signupDate"
                sort={sort}
                onSort={onSort}
                className={METRICS_SORT_HEAD}
              >
                Signup Date
              </SortableHead>
              <SortableHead
                column="churnDate"
                sort={sort}
                onSort={onSort}
                className={METRICS_SORT_HEAD}
              >
                Churn Date
              </SortableHead>
              <SortableHead
                column="lifetimeValue"
                sort={sort}
                onSort={onSort}
                align="right"
                className={METRICS_SORT_HEAD}
              >
                Lifetime Value
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => (
              <TableRow key={s.id} className="hover:bg-transparent">
                <TableCell className={CELL}>
                  <Who name={s.name} email={s.email} />
                </TableCell>
                <TableCell className={CELL}>{formatDate(s.signupDate)}</TableCell>
                <TableCell className={CELL}>{formatDate(s.churnDate)}</TableCell>
                <TableCell className={`${CELL} text-right font-bold tracking-tight tabular-nums`}>
                  {formatCurrency(s.lifetimeValue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResponsiveTable>
    </TableCard>
  )
}
