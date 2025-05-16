import type { APIOverwrite, ChannelType, GuildChannelType, ThreadChannelType } from 'discord-api-types/v10';
import { kData, kMixinConstruct } from '../../utils/symbols';
import type { Channel, ChannelDataType } from '../Channel';
import { PermissionOverwrite } from '../PermissionOverwrite';

export interface ChannelPermissionMixin<
	Type extends Exclude<GuildChannelType, ChannelType.GuildDirectory | ThreadChannelType>,
> extends Channel<Type> {
	/**
	 * The explicit permission overwrites for members and roles
	 */
	permissionOverwrites: readonly PermissionOverwrite[] | null;
}

export class ChannelPermissionMixin<
	Type extends Exclude<GuildChannelType, ChannelType.GuildDirectory | ThreadChannelType>,
> {
	public static DataTemplate: Partial<
		ChannelDataType<Exclude<GuildChannelType, ChannelType.GuildDirectory | ThreadChannelType>>
	> = {
		set permission_overwrites(_: APIOverwrite[]) {},
	};

	public [kMixinConstruct](data: Partial<ChannelDataType<Type>>) {
		this._optimizeData(data);
	}

	/**
	 * {@inheritDoc Structure._optimizeData}
	 */
	protected _optimizeData(data: Partial<ChannelDataType<Type>>) {
		this.permissionOverwrites = data.permission_overwrites
			? data.permission_overwrites.map((overwrite) => new PermissionOverwrite(overwrite))
			: (this.permissionOverwrites ?? null);
	}

	/**
	 * The sorting position of the channel
	 */
	public get position() {
		return this[kData].position;
	}

	/**
	 * Indicates whether this channel can have permission overwrites
	 */
	public isPermissionCapabale(): this is ChannelPermissionMixin<
		Extract<Type, Exclude<GuildChannelType, ChannelType.GuildDirectory | ThreadChannelType>>
	> {
		return true;
	}

	protected _toJSON(data: Partial<ChannelDataType<Type>>) {
		if (this.permissionOverwrites) {
			data.permission_overwrites = this.permissionOverwrites?.map((overwrite) => overwrite.toJSON());
		}

		return data;
	}
}
