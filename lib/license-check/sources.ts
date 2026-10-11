import { massachusetts } from './massachusetts'
import { connecticut, illinois, rhodeIsland, texas, washington } from './states'
import { newJersey } from './newJersey'
import { pennsylvania } from './pennsylvania'
import { vermont } from './vermont'
import type { StateSource } from './types'

// Add a state here once its reader exists. Everything else is state-agnostic.
export const SOURCES: StateSource[] = [massachusetts, rhodeIsland, washington, texas, illinois, connecticut, newJersey, pennsylvania, vermont]

/** The states an organization can add nightly checking for. */
export const SUPPORTED_STATE_CODES: string[] = SOURCES.map(s => s.code)
