"use client";

import type { ReactNode } from "react";
import { Tabs } from "@heroui/react";
import "./hero-ui.css";

interface HeroTabsProps<T extends string> {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  children: ReactNode;
}

export function HeroTabs<T extends string>({ items, value, onChange, label, children }: HeroTabsProps<T>) {
  return <Tabs className="colibly-hero-tabs" selectedKey={value} onSelectionChange={(key) => onChange(String(key) as T)}>
    <Tabs.List aria-label={label}>
      {items.map((item) => <Tabs.Tab key={item.id} id={item.id}><Tabs.Indicator />{item.label}</Tabs.Tab>)}
    </Tabs.List>
    {items.map((item) => <Tabs.Panel key={item.id} id={item.id}>{value === item.id ? children : null}</Tabs.Panel>)}
  </Tabs>;
}
