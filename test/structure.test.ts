import { describe, it, expect } from 'vitest'
import { parseTopos } from '../src/core/topos'
import { designLints } from '../src/core/coverage/structure'

function lints(src: string) {
  const world = parseTopos(src).world!
  return designLints(world)
}
const cats = (src: string) => lints(src).map((e) => e.category)

describe('designLints', () => {
  it('passes a house-style map (boundaries everywhere, arrows edge-declared)', () => {
    // this is the SKILL.md exemplar — it must stay lint-clean
    const src = `
      thing Order   { items: [text]  table: int }
      thing Cup     { drink: text  size: text }
      thing Beans   { origin: text  kg: number }
      thing Payment { amount: money  method: text }

      world CoffeeBar {
        gateway Customer { out Order  in Cup  out Payment }
        gateway Roaster  { in Payment  out Beans }

        system FrontOfHouse {
          in Order   out Order
          in Cup     out Cup
          in Payment out Payment

          activity TakeOrder { in Order  out Order }
          activity Serve     { in Cup  out Cup }
        }

        system BackOfHouse {
          in Order  in Beans  out Cup

          activity Brew  { in Order  in Beans  out Cup }
          storage  Shelf { holds Beans }

          Shelf --( Beans )--> Brew
        }

        Customer     --( Order )-->   TakeOrder
        TakeOrder    --( Order )-->   Brew
        Brew         --( Cup )-->     Serve
        Serve        --( Cup )-->     Customer
        Customer     --( Payment )--> FrontOfHouse
        FrontOfHouse --( Payment )--> Roaster
        Roaster      --( Beans )-->   Shelf
      }`
    expect(lints(src)).toEqual([])
  })

  it('flags bare leaves (activity/storage/gateway with no boundary)', () => {
    const src = `world W {
      system App {
        in X
        activity Charges { }
        storage Ledger { }
      }
      gateway Stripe { }
    }`
    const found = lints(src).filter((e) => e.category === 'bare-leaf')
    expect(found.map((e) => e.system).sort()).toEqual(['Charges', 'Ledger', 'Stripe'])
  })

  it('flags a junk-drawer system (wired to nothing), only at the topmost box', () => {
    const src = `world W {
      system Core { in X  activity A { in X } }
      system Operations {
        activity Scripts { }
        activity Tests { }
      }
    }`
    const disc = lints(src).filter((e) => e.category === 'disconnected-system')
    expect(disc.map((e) => e.system)).toEqual(['Operations'])
  })

  it('does not flag a boundary-less container whose descendants are wired', () => {
    // house style allows e.g. `system Maintenance` with no own boundary when its
    // leaves are fully wired at the parent level
    const src = `world W {
      system Maintenance {
        activity Retention { in Receipt }
      }
      storage Receipts { holds Receipt }
      Receipts --( Receipt )--> Retention
    }`
    expect(cats(src)).not.toContain('disconnected-system')
  })

  it('flags a flow through boxes that never mention the Thing', () => {
    // X flows into Handler, but neither Handler nor App declare X anywhere
    const src = `world W {
      gateway Src { out X }
      system App {
        activity Handler { in Y  out Y }
      }
      Src --( X )--> Handler
    }`
    const gaps = lints(src).filter((e) => e.category === 'boundary-gap')
    expect(gaps).toHaveLength(1)
    expect(gaps[0].detail).toContain("Handler (add 'in X')")
    expect(gaps[0].detail).toContain("App (add 'in X')")
  })

  it('tolerates house-style looseness: holds implies reads, children cover the parent', () => {
    const src = `world W {
      system Storage {
        in Listing
        storage Listings { holds Listing }
      }
      system Query {
        activity Search { in Listing  out Result }
      }
      Listings --( Listing )--> Search
    }`
    // Storage's subtree holds Listing; Query's subtree mentions it via Search → no gap
    expect(cats(src)).not.toContain('boundary-gap')
  })

  it('storage holds satisfies both in and out at endpoints', () => {
    const src = `world W {
      system App {
        in X  out X
        activity Write { out X }
        storage Store { holds X }
        activity Read { in X }
        Write --( X )--> Store
        Store --( X )--> Read
      }
    }`
    expect(cats(src)).not.toContain('boundary-gap')
  })

  it('flags arrows to undeclared names', () => {
    const src = `world W {
      system App { out X }
      App --( X )--> Nowhere
    }`
    const found = lints(src).filter((e) => e.category === 'unknown-endpoint')
    expect(found.map((e) => e.system)).toEqual(['Nowhere'])
  })

  it('flags Things used without a declaration, once per Thing', () => {
    const src = `world W {
      system A { out X  out X }
      system B { in X  in Y }
      A --( X )--> B
    }`
    const found = lints(src).filter((e) => e.category === 'undeclared-thing')
    expect(found.map((e) => e.detail.split(' ')[0]).sort()).toEqual(['X', 'Y'])
  })

  it('flags declared Things with no fields', () => {
    const src = `thing X { }\nthing Y { id: id }\nworld W {
      system A { out X  in Y }
    }`
    const found = lints(src).filter((e) => e.category === 'empty-thing')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('thing X { }')
  })

  it('flags lazily-typed fields whose names imply a richer type', () => {
    const src = `thing Listing {
      listing_id: text
      price_amount: int
      scraped_at: text
      is_active: text
      country_code: text
      title: text
    }
    world W { system A { out Listing } }`
    const found = lints(src).filter((e) => e.category === 'suspect-field-type')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('listing_id: text → id')
    expect(found[0].detail).toContain('price_amount: int → money')
    expect(found[0].detail).toContain('scraped_at: text → time')
    expect(found[0].detail).toContain('is_active: text → bool')
    // honest fields don't fire: country_code/title are legitimately text
    expect(found[0].detail).not.toContain('country_code')
    expect(found[0].detail).not.toContain('title')
  })

  it('does not flag honestly-typed fields', () => {
    const src = `thing Listing { listing_id: id  price_amount: money  scraped_at: time  is_active: bool }
    world W { system A { out Listing } }`
    expect(cats(src)).not.toContain('suspect-field-type')
  })
})
