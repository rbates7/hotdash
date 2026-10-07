"use client"

import * as React from "react"

import { formatDate } from "@/lib/metrics/clock"
import {
  formatCurrency,
  sortRows,
  toggleSort,
  type ChurnedSubscriber,
  type NewSubscriber,
  type Plan,
  type Sort,
} from "@/lib/metrics"
import { seedChurnedSubscribers, seedNewSubscribers } from "@/lib/metrics-fixture"
import { useMetrics } from "@/components/metrics/metrics-store"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CELL,
  Pill,
  SortableHead,
  TableCard,
  Who,
} from "@/components/metrics/table-bits"

const PLAN_TONE: Record<Plan, "plan" | "annual" | "muted"> = {
  Monthly: "plan",
  Annual: "annual",
  Staff: "muted",
}

type NewKey = "name" | "plan" | "signupDate"

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
      <Table aria-label="New subscribers">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead column="name" sort={sort} onSort={onSort}>
              Name / Email
            </SortableHead>
            <SortableHead column="plan" sort={sort} onSort={onSort}>
              Plan
            </SortableHead>
            <SortableHead column="signupDate" sort={sort} onSort={onSort}>
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
    </TableCard>
  )
}

type ChurnKey = "name" | "signupDate" | "churnDate" | "lifetimeValue"

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
      <Table aria-label="Churned subscribers">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead column="name" sort={sort} onSort={onSort}>
              Name / Email
            </SortableHead>
            <SortableHead column="signupDate" sort={sort} onSort={onSort}>
              Signup Date
            </SortableHead>
            <SortableHead column="churnDate" sort={sort} onSort={onSort}>
              Churn Date
            </SortableHead>
            <SortableHead column="lifetimeValue" sort={sort} onSort={onSort} align="right">
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
    </TableCard>
  )
}
