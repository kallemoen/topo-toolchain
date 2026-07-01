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
})
