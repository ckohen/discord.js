import { describe, test, expect } from 'vitest';
import type { APIData } from './mixinClasses.js';
import { Mixed } from './mixinClasses.js';

describe('Mixin function', () => {
	const data: APIData = {
		id: '1',
		property1: 23,
	};

	test('Mixed class has all getters', () => {
		const instance = new Mixed(data);
		expect(instance.id).toBe(data.id);
		expect(instance.property1).toBe(data.property1);
		expect(instance.property2).toBe(data.property2);
	});

	test('Mixed class has all methods', () => {
		const instance = new Mixed(data);
		expect(instance.getId()).toBe(data.id);
		expect(instance.getProperty1()).toBe(data.property1);
		expect(instance.getProperty2()).toBe(data.property2);
		expect(instance.getProperties()).toEqual({ property1: data.property1, property2: data.property2 });
	});
});