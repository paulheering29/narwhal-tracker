import { massachusetts } from './massachusetts'
import { connecticut, illinois, rhodeIsland, texas, washington } from './states'
import { newJersey } from './newJersey'
import { pennsylvania } from './pennsylvania'
import { vermont } from './vermont'
import type { StateSource } from './types'

// Add a state here once its reader exists. Everything else is state-agnostic.
export const SOURCES: StateSource[] = [massachusetts, rhodeIsland, washington, texas, illinois, connecticut, newJersey, pennsylvania, vermont]

/**
 * States whose list can't be fetched by a machine (Arizona's site only serves a browser;
 * Ohio needs tokens copied from one). The owner supplies these from /owner, so they are
 * only as fresh as the last upload -- a license checked against an old list says so.
 */
export const MANUAL_STATE_CODES = ['AZ', 'OH']

/** The states an organization can add nightly checking for. */
export const SUPPORTED_STATE_CODES: string[] = [...SOURCES.map(s => s.code), ...MANUAL_STATE_CODES]
