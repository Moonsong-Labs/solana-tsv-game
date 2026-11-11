/**
 * The whole town on the stage: the island, every place, the effects and the
 * people. The director moves things; the world only knows how to show them.
 */
import * as THREE from 'three';

import type { V3 } from '../scene/kit.ts';
import type { Stage } from '../scene/stage.ts';
import { type Archive, createArchive } from './archive.ts';
import { type Bureau, createBureau } from './bureau.ts';
import { type Chain, createChain } from './chain.ts';
import { Character, LOOKS, type CharacterSpec, type LookId } from './character.ts';
import { type Council, createCouncil } from './council.ts';
import { type Crane, type Exchange, type HaltBoard, createCrane, createExchange, createHaltBoard } from './exchange.ts';
import { Fx } from './fx.ts';
import { type Gate, createGate } from './gate.ts';
import { type Indexer, createIndexer } from './indexer.ts';
import { type Island, createIsland } from './island.ts';
import { type Issuer, createIssuer } from './issuer.ts';
import { SITES } from './layout.ts';
import type { Place } from './place.ts';
import { type PoolPlace, createPool } from './pool.ts';

export type PlaceId =
    'issuer' | 'bureau' | 'gate' | 'pool' | 'council' | 'exchange' | 'haltBoard' | 'archive' | 'indexer' | 'chain';

export interface Places {
    issuer: Issuer;
    bureau: Bureau;
    gate: Gate;
    pool: PoolPlace;
    council: Council;
    exchange: Exchange;
    haltBoard: HaltBoard;
    archive: Archive;
    indexer: Indexer;
    chain: Chain;
}

export class World {
    readonly island: Island;
    readonly places: Places;
    readonly fx: Fx;
    readonly cranes: Crane[] = [];
    private readonly people = new Map<string, Character>();

    constructor(readonly stage: Stage) {
        this.island = createIsland();
        stage.scene.add(this.island.group);

        this.places = {
            issuer: createIssuer(),
            bureau: createBureau(),
            gate: createGate(),
            pool: createPool(),
            council: createCouncil(),
            exchange: createExchange(),
            haltBoard: createHaltBoard(),
            archive: createArchive(),
            indexer: createIndexer(),
            chain: createChain(),
        };
        for (const [id, place] of Object.entries(this.places) as [PlaceId, Place][]) {
            stage.scene.add(place.group);
            stage.addPickable(place.hitbox, id);
        }

        this.fx = new Fx(stage.scene);
        this.fx.setPetalSources([
            new THREE.Vector3(-9.4, 3.2, -2.2),
            new THREE.Vector3(-3.3, 2.1, 11.05),
            new THREE.Vector3(5.1, 2.8, 10.9),
        ]);

        for (let i = 0; i < 2; i += 1) {
            const crane = createCrane();
            crane.group.visible = false;
            stage.scene.add(crane.group);
            this.cranes.push(crane);
        }

        stage.onUpdate((dt, time) => {
            this.island.update(dt, time);
            for (const place of Object.values(this.places) as Place[]) place.update?.(dt, time);
            for (const person of this.people.values()) person.update(dt);
            for (const crane of this.cranes) if (crane.group.visible) crane.update(dt, time);
            this.fx.setPixelScale(stage.pixelsPerUnit() * stage.renderer.getPixelRatio());
            this.fx.update(dt, time);
        });
    }

    /** The person with this id, created at `at` if they are not in town yet. */
    person(id: string, look: LookId | CharacterSpec, at?: V3 | THREE.Vector3, heading?: number): Character {
        let person = this.people.get(id);
        if (!person) {
            person = new Character(typeof look === 'string' ? LOOKS[look] : look);
            this.people.set(id, person);
            this.stage.scene.add(person.root);
            if (at) person.place(at, heading);
        }
        return person;
    }

    /** The person with this id, if they are in town. */
    find(id: string): Character | undefined {
        return this.people.get(id);
    }

    /** Takes a person out of town. */
    dismiss(id: string): void {
        const person = this.people.get(id);
        if (!person) return;
        this.stage.scene.remove(person.root);
        this.people.delete(id);
        person.dispose();
    }

    /** Everyone in town, by id. */
    everyone(): ReadonlyMap<string, Character> {
        return this.people;
    }

    /** The ground position of a site, lifted to `y`. */
    site(id: keyof typeof SITES, y = 0): THREE.Vector3 {
        return new THREE.Vector3(SITES[id][0], y, SITES[id][1]);
    }
}
