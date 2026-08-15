/**
 * Pure delivery calculations.
 *
 * Rounding rules:
 * - batteryCost: ceil() to whole battery points
 * - duration:    ceil() to whole hours
 * - risk:        round() to whole percent points, then clamped to [0, 90]
 *
 * Game Design v2: every calculation runs on the EFFECTIVE rover stats
 * (`computeRoverStats`), never on the raw base values.
 *
 * These functions never touch React, Prisma, Next.js, randomness or time.
 */

import {
  CARGO_BATTERY_COST_PER_KG,
  LOAD_RATIO_RISK_WEIGHT,
  MAX_RISK_PERCENT,
  MAX_SIMULATION_SECONDS,
  MAX_UPGRADE_LEVEL,
  MIN_RISK_PERCENT,
  MIN_SIMULATION_SECONDS,
  SIMULATION_SECONDS_PER_HOUR,
  SPEED_MULTIPLIER_BASE,
} from './constants'
import { assertFinite, assertPositive } from './errors'
import { ceilToInt, clamp, roundToInt } from './math'
import { computeRoverStats } from './roverStats'
import type {
  DeliveryContext,
  DeliveryEstimate,
  MoonLocation,
  Order,
  RoverStats,
} from './types'

type BatteryInput = {
  order: Pick<Order, 'weight'> & { readonly isChallenge?: boolean }
  rover: Pick<RoverStats, 'efficiency'>
  location: Pick<MoonLocation, 'distance' | 'batteryModifier'> & {
    readonly zoneType?: MoonLocation['zoneType']
  }
}

type DurationInput = {
  rover: { readonly speed: number }
  location: Pick<MoonLocation, 'distance' | 'speedModifier'>
}

type RiskInput = {
  order: Pick<Order, 'weight' | 'baseRisk'>
  rover: Pick<RoverStats, 'capacity'> & {
    readonly safetyRiskReduction?: number
  }
  location: Pick<MoonLocation, 'riskBonus'>
}

/**
 * Extra battery multiplier for the impossible "challenge" contract when it is
 * routed to a dark-zone location. It pushes the round-trip cost beyond even a
 * fully-upgraded battery, so the contract is unsolvable by ENERGY (not by cargo
 * weight) regardless of upgrades. Derived purely from the persisted
 * `order.isChallenge` flag and the location zone, so it needs no database column.
 */
export const CHALLENGE_DARK_ZONE_BATTERY_HAZARD = 3

export function challengeBatteryHazard(
  order: { readonly isChallenge?: boolean },
  location: { readonly zoneType?: MoonLocation['zoneType'] },
): number {
  return order.isChallenge === true && location.zoneType === 'dark'
    ? CHALLENGE_DARK_ZONE_BATTERY_HAZARD
    : 1
}

/** Battery points required for the round trip, in whole percent points. */
export function calculateBatteryCost({
  order,
  rover,
  location,
}: BatteryInput): number {
  assertPositive(rover.efficiency, 'rover.efficiency')
  assertFinite(location.distance, 'location.distance')
  assertFinite(location.batteryModifier, 'location.batteryModifier')
  assertFinite(order.weight, 'order.weight')

  const baseDistanceCost = location.distance * location.batteryModifier
  const cargoCost = order.weight * CARGO_BATTERY_COST_PER_KG
  const hazard = challengeBatteryHazard(order, location)

  return ceilToInt(((baseDistanceCost + cargoCost) / rover.efficiency) * hazard)
}

/** Delivery duration in whole hours. */
export function calculateDuration({ rover, location }: DurationInput): number {
  assertPositive(rover.speed, 'rover.speed')
  assertPositive(location.speedModifier, 'location.speedModifier')
  assertFinite(location.distance, 'location.distance')

  return ceilToInt(location.distance / (rover.speed * location.speedModifier))
}

/** Failure risk in whole percent points, clamped to [0, 90]. */
export function calculateRisk({ order, rover, location }: RiskInput): number {
  assertPositive(rover.capacity, 'rover.capacity')
  assertFinite(order.weight, 'order.weight')
  assertFinite(order.baseRisk, 'order.baseRisk')
  assertFinite(
    rover.safetyRiskReduction ?? 0,
    'rover.safetyRiskReduction',
  )

  const loadRatio = order.weight / rover.capacity
  const rawRisk =
    order.baseRisk +
    location.riskBonus +
    loadRatio * LOAD_RATIO_RISK_WEIGHT -
    (rover.safetyRiskReduction ?? 0)

  return clamp(roundToInt(rawRisk), MIN_RISK_PERCENT, MAX_RISK_PERCENT)
}

/** Full server-side estimate for one delivery attempt. */
export function calculateDeliveryEstimate(
  context: DeliveryContext,
): DeliveryEstimate {
  const { order, location } = context
  const stats = computeRoverStats(context.rover)

  return {
    batteryCost: calculateBatteryCost({ order, rover: stats, location }),
    duration: calculateDuration({ rover: { speed: context.rover.speed }, location }),
    risk: calculateRisk({ order, rover: stats, location }),
    reward: order.reward,
  }
}

/**
 * Real-time length of the delivery animation in whole seconds.
 *
 * Game Design v2: derived from the calculated duration in hours and the rover
 * speed-upgrade level, then clamped to a UI-friendly window.
 */
export function calculateSimulationSeconds(
  calculatedDurationHours: number,
  speedLevel: number,
): number {
  assertFinite(calculatedDurationHours, 'calculatedDurationHours')
  assertFinite(speedLevel, 'speedLevel')

  const level = clamp(speedLevel, 0, MAX_UPGRADE_LEVEL)

  // The cap is a UX limit on how long the player stares at the animation, so it
  // must be applied to the BASE duration and the speed bonus applied after it.
  // Capping the already-multiplied value silently ate the whole upgrade on long
  // routes: a 49s route clamped to 40s at level 0 and to 40s at level 1 too, so
  // the shop advertised "-20%" and delivered "40 -> 40 seconds".
  const base = clamp(
    ceilToInt(calculatedDurationHours * SIMULATION_SECONDS_PER_HOUR),
    MIN_SIMULATION_SECONDS,
    MAX_SIMULATION_SECONDS,
  )
  const scaled = ceilToInt(base * SPEED_MULTIPLIER_BASE ** level)

  return clamp(scaled, MIN_SIMULATION_SECONDS, MAX_SIMULATION_SECONDS)
}
