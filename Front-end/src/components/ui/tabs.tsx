"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-gray-100 border border-gray-200 p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Base — ressemble à un vrai bouton avec bordure et fond blanc
        "inline-flex items-center justify-center gap-1.5 rounded-lg",
        "px-3.5 py-2 text-sm font-medium whitespace-nowrap",
        "border border-gray-200 bg-white text-gray-500",
        "cursor-pointer select-none",
        "transition-all duration-150",
        // Hover — feedback clair que c'est cliquable
        "hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300 hover:shadow-sm",
        // Actif — plein couleur avec ombre
        "data-[state=active]:bg-indigo-600 data-[state=active]:text-white",
        "data-[state=active]:border-indigo-600 data-[state=active]:shadow-md",
        "data-[state=active]:hover:bg-indigo-700",
        // Disabled
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
