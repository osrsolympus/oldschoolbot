import { CommandStore, KlasaMessage, KlasaUser } from 'klasa';
import { Monsters } from 'oldschooljs';

import { BotCommand } from '../../lib/BotCommand';
import { Time, Activity, Tasks } from '../../lib/constants';
import {
	calcWhatPercent,
	formatDuration,
	reduceNumByPercent,
	rand,
	percentChance,
	removeBankFromBank
} from '../../lib/util';
import { sumOfSetupStats } from '../../lib/gear/functions/sumOfSetupStats';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import { FightCavesActivityTaskOptions } from '../../lib/types/minions';
import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';
import mejJalImage from '../../lib/image/mejJalImage';
import { bankHasAllItemsFromBank } from '../../lib/util/bankHasAllItemsFromBank';
import createReadableItemListFromBank from '../../lib/util/createReadableItemListFromTuple';
import fightCavesSupplies from '../../lib/minions/data/fightCavesSupplies';
import { minionNotBusy, requiresMinion } from '../../lib/minions/decorators';
import itemID from '../../lib/util/itemID';
import { GearSetupTypes } from '../../lib/gear/types';
import { SkillsEnum } from '../../lib/skilling/types';

const { TzTokJad } = Monsters;

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			oneAtTime: true,
			altProtection: true,
			requiredPermissions: ['ATTACH_FILES']
		});
	}

	determineDuration(user: KlasaUser): [number, string] {
		let baseTime = Time.Hour * 2;

		let debugStr = '';

		// Reduce time based on KC
		const jadKC = user.getKC(TzTokJad);
		const percentIncreaseFromKC = Math.floor(calcWhatPercent(Math.min(50, jadKC), 50)) / 2;
		baseTime = reduceNumByPercent(baseTime, percentIncreaseFromKC);
		debugStr += `${percentIncreaseFromKC}% from KC`;

		// Reduce time based on Gear
		const usersRangeStats = sumOfSetupStats(user.settings.get(UserSettings.Gear.Range));
		const percentIncreaseFromRangeStats =
			Math.floor(calcWhatPercent(usersRangeStats.attack_ranged, 236)) / 2;
		baseTime = reduceNumByPercent(baseTime, percentIncreaseFromRangeStats);

		debugStr += `, ${percentIncreaseFromRangeStats}% from Gear`;

		return [baseTime, debugStr];
	}

	determineChanceOfDeathPreJad(user: KlasaUser) {
		const attempts = user.settings.get(UserSettings.Stats.FightCavesAttempts);
		let deathChance = 14 - attempts * 2;

		// -4% Chance of dying before Jad if you have SGS.
		if (user.hasItemEquippedAnywhere(itemID('Saradomin godsword'))) {
			deathChance -= 4;
		}

		return Math.max(deathChance, 5);
	}

	determineChanceOfDeathInJad(user: KlasaUser) {
		const attempts = user.settings.get(UserSettings.Stats.FightCavesAttempts);
		const chance = Math.floor(100 - (Math.log(attempts) / Math.log(Math.sqrt(15))) * 50);

		// Chance of death cannot be 100% or <5>%.
		return Math.max(Math.min(chance, 99), 5);
	}

	async checkGear(user: KlasaUser) {
		const equippedWeapon = user.equippedWeapon(GearSetupTypes.Range);

		const usersRangeStats = sumOfSetupStats(user.settings.get(UserSettings.Gear.Range));

		if (
			!equippedWeapon ||
			!equippedWeapon.weapon ||
			!['crossbows', 'bows'].includes(equippedWeapon.weapon.weapon_type)
		) {
			throw `JalYt, you not wearing ranged weapon?! TzTok-Jad stomp you to death if you get close, come back with range weapon.`;
		}

		if (usersRangeStats.attack_ranged < 160) {
			throw `JalYt, your ranged gear not strong enough! You die very quickly with your bad gear, come back with better range gear.`;
		}

		if (!bankHasAllItemsFromBank(user.settings.get(UserSettings.Bank), fightCavesSupplies)) {
			throw `JalYt, you need supplies to have a chance in the caves...come back with ${await createReadableItemListFromBank(
				this.client,
				fightCavesSupplies
			)}.`;
		}

		if (user.skillLevel(SkillsEnum.Prayer) < 43) {
			throw `JalYt, come back when you have atleast 43 Prayer, TzTok-Jad annihilate you without protection from gods.`;
		}
	}

	@minionNotBusy
	@requiresMinion
	async run(msg: KlasaMessage) {
		await msg.author.settings.sync(true);
		try {
			await this.checkGear(msg.author);
		} catch (err) {
			if (typeof err === 'string') {
				return msg.channel.send(await mejJalImage(err));
			}
			throw err;
		}

		let [duration, debugStr] = this.determineDuration(msg.author);
		const jadDeathChance = this.determineChanceOfDeathInJad(msg.author);
		const preJadDeathChance = this.determineChanceOfDeathPreJad(msg.author);

		const attempts = msg.author.settings.get(UserSettings.Stats.FightCavesAttempts);
		const usersRangeStats = sumOfSetupStats(msg.author.settings.get(UserSettings.Gear.Range));
		const jadKC = msg.author.getKC(TzTokJad);

		duration += (rand(1, 5) * duration) / 100;

		const diedPreJad = percentChance(preJadDeathChance);
		const preJadDeathTime = diedPreJad ? rand(Time.Minute * 20, duration) : null;
		const finishDate = Date.now() + (preJadDeathTime ?? duration);

		const bank = msg.author.settings.get(UserSettings.Bank);
		const newBank = removeBankFromBank(bank, fightCavesSupplies);
		await msg.author.settings.update(UserSettings.Bank, newBank);

		const data: FightCavesActivityTaskOptions = {
			minigameID: TzTokJad.id,
			userID: msg.author.id,
			channelID: msg.channel.id,
			quantity: 1,
			duration,
			type: Activity.FightCaves,
			id: rand(1, 10_000_000),
			finishDate,
			jadDeathChance,
			preJadDeathChance,
			preJadDeathTime
		};

		await addSubTaskToActivityTask(this.client, Tasks.MinigameTicker, data);
		msg.author.incrementMinionDailyDuration(duration);

		const totalDeathChance = (
			((100 - preJadDeathChance + 1) * (100 - jadDeathChance)) /
			100
		).toFixed(1);

		return msg.send(
			`**Duration:** ${formatDuration(duration)} (${(duration / 1000 / 60).toFixed(
				2
			)} minutes)
**Boosts:** ${debugStr}
**Range Attack Bonus:** ${usersRangeStats.attack_ranged}
**Jad KC:** ${jadKC}
**Attempts:** ${attempts}

**Removed from your bank:** ${await createReadableItemListFromBank(
				this.client,
				fightCavesSupplies
			)}`,
			await mejJalImage(
				`You're on your own now JalYt, prepare to fight for your life! I think you have ${totalDeathChance}% chance of survival.`
			)
		);
	}
}
