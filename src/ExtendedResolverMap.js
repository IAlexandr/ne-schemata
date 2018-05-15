// @flow

import type { GraphQLSchema } from 'graphql'
import type { Schemata } from './Schemata'

/**
 * A flow type defining the parameters for creating a new instance of
 * `ExtendedResolverMap`. At least the resolver map is required, but ideally
 * a `.schema` or `.sdl` value are desired
 *
 * @type {ExtendedResolverMapConfig}
 */
export type ExtendedResolverMapConfig = {
  schema?: ?GraphQLSchema,
  sdl?: (string|Schemata),
  resolvers: { [string]: string }
}

/**
 * A class that stores information about a set of resolvers and their
 * associated GraphQLSchema (or the sdl to make one), such that when
 * multiple SDL/Schema merges occur the subsequently merged Schemas have
 * a history of the unbound resolver functiosn from previous merges (in order)
 *
 * @class ExtendedResovlerMap
 */
export class ExtendedResolverMap {
  schema: ?GraphQLSchema
  sdl: ?(string|Schemata)
  resolvers: ?{ [string]: string }

  /**
   * The constructor takes an object with at least SDL or a GraphQLSchema and
   * a resolver map object of untainted and unbound resolver functions
   *
   * @constructor
   * @param {ExtendedResolverMapConfig} config an object conforming to the
   * flow type `ExtendedResolverMapConfig` as defined above.
   */
  constructor(config: ExtendedResolverMapConfig) {
    this.schema = config.schema
    this.sdl = config.schema
    this.resolvers = config.resolvers
  }

  /**
   * A useful iterator on instances of ExtendedResolverMap that yields a
   * key and value for each entry found in the resolvers object set on this
   * instance
   *
   * @return {Function} a bound generator function that iterates over the
   * key/value props of the internal .resovlers property
   */
  get [Symbol.iterator](): Function {
    return (function *() {
      for (let key of Object.keys(this.resolvers)) {
        yield {key, value: this.resolvers[key]}
      }
    }).bind(this)
  }

  /**
   * A shorthand way to create a new instance of `ExtendedResolverMap`
   *
   * @param {ExtendedResolverMapConfig} config the same config object passed
   * to the constructor
   * @return {ExtendedResolverMap} a new instance of `ExtendedResolverMap`
   */
  static from(config: ExtendedResolverMapConfig): ExtendedResolverMap {
    return new ExtendedResolverMap(config)
  }
}