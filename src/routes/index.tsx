import { createFileRoute } from "@tanstack/react-router";
import { SwarmApp } from "@/swarm/app";

export const Route = createFileRoute("/")({ component: SwarmApp });
