'use client';

import { Section as DJSSection, type SectionOptions } from '@ckohen/ui';
import type { PropsWithChildren } from 'react';

export function Section(options: PropsWithChildren<SectionOptions>) {
	return <DJSSection {...options} />;
}
