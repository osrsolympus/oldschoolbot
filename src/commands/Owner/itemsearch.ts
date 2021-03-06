import { CommandStore, KlasaMessage } from 'klasa';
import { Items } from 'oldschooljs';
import { Item } from 'oldschooljs/dist/meta/types';

import { BotCommand } from '../../lib/BotCommand';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			cooldown: 2,
			usage: '<name:str>',
			aliases: ['is']
		});
	}

	async run(msg: KlasaMessage, [name]: [string]) {
		const items = Items.filter(i => {
			if (msg.flagArgs.includes) {
				return i.name.toLowerCase().includes(name.toLowerCase());
			}
			return i.name.toLowerCase() === name.toLowerCase();
		}).array();
		if (items.length === 0) return msg.send(`No results for that item.`);

		const gettedItem = Items.get(name);

		return msg.send(
			`Found ${items.length} items:\n${(items as Item[])
				.map(
					(item, index) => `${gettedItem!.id === item.id ? '**' : ''}
${index + 1}. ${item.name}[${item.id}] ${
						item.tradeable_on_ge ? 'GE_Tradeable' : 'Not_GE_Tradeable'
					} ${item.tradeable ? 'Tradeable' : 'Not_Tradeable'} ${
						item.incomplete ? 'Incomplete' : 'Not_Incomplete'
					} ${item.duplicate ? 'Duplicate' : 'Not_Duplicate'}${
						gettedItem!.id === item.id ? '**' : ''
					}`
				)
				.join('\n')}`
		);
	}
}
