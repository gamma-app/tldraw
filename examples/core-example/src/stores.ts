import { TLBounds, TLPage, TLPageState, Utils } from '@tldraw/core'
import Vec from '@tldraw/vec'
import type { Shape } from './shapes'

export class Page implements TLPage<Shape> {
  id
  name
  shapes
  bindings

  constructor(opts = {} as TLPage<Shape>) {
    const { id = Utils.uniqueId(), name = 'page', shapes = {}, bindings = {} } = opts
    this.id = id
    this.name = name
    this.shapes = shapes
    this.bindings = bindings
  }

  dragShape(id: string, point: number[]) {
    const shape = this.shapes[id]
    shape.point = Vec.sub(point, Vec.div(shape.size, 2))
  }
}

export class PageState implements TLPageState {
  id
  selectedIds
  camera
  brush?: TLBounds
  pointedId?: string
  hoveredId?: string
  editingId?: string
  bindingId?: string

  constructor(opts = {} as TLPageState) {
    const {
      id = Utils.uniqueId(),
      selectedIds = [],
      camera = {
        point: [0, 0],
        zoom: 1,
      },
    } = opts
    this.id = id
    this.camera = camera
    this.selectedIds = selectedIds
  }

  setHoveredId = (id: string | undefined) => {
    this.hoveredId = id
  }

  setSelectedIds = (id: string) => {
    if (!this.selectedIds.includes(id)) {
      this.selectedIds = [id]
    }
  }

  clearSelectedIds = () => {
    this.selectedIds = []
  }

  pan = (point: number[]) => {
    this.camera.point = Vec.add(this.camera.point, point)
  }
}
