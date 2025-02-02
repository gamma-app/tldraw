import { SVGContainer, TLBounds, Utils } from '@tldraw/core'
import {
  intersectBoundsPolygon,
  intersectLineSegmentPolyline,
  intersectRayLineSegment,
} from '@tldraw/intersect'
import Vec from '@tldraw/vec'
import * as React from 'react'
import { BINDING_DISTANCE, GHOSTED_OPACITY, LABEL_POINT } from '~constants'
import { TDShapeUtil } from '~state/shapes/TDShapeUtil'
import {
  TextLabel,
  defaultStyle,
  getBoundsRectangle,
  getFontStyle,
  getShapeStyle,
  transformRectangle,
  transformSingleRectangle,
  getTextLabelSize,
  getTextSvgElement,
  getFontSize,
  getFontFace
} from '~state/shapes/shared'
import { styled } from '~styles'
import { AlignStyle, DashStyle, TDMeta, TDShape, TDShapeType, TriangleShape } from '~types'
import { DashedTriangle } from './components/DashedTriangle'
import { DrawTriangle } from './components/DrawTriangle'
import { TriangleBindingIndicator } from './components/TriangleBindingIndicator'
import { getTriangleCentroid, getTrianglePoints } from './triangleHelpers'

type T = TriangleShape
type E = HTMLDivElement

export class TriangleUtil extends TDShapeUtil<T, E> {
  type = TDShapeType.Triangle as const

  canBind = true

  canClone = true

  canEdit = true

  getShape = (props: Partial<T>): T => {
    return Utils.deepMerge<T>(
      {
        id: 'id',
        type: TDShapeType.Triangle,
        name: 'Triangle',
        parentId: 'page',
        childIndex: 1,
        point: [0, 0],
        size: [1, 1],
        rotation: 0,
        style: defaultStyle,
        label: '',
        labelPoint: [0.5, 0.5],
      },
      props
    )
  }

  Component = TDShapeUtil.Component<T, E, TDMeta>(
    (
      {
        shape,
        bounds,
        isBinding,
        isEditing,
        isSelected,
        isGhost,
        meta,
        events,
        onShapeChange,
        onShapeBlur,
      },
      ref
    ) => {
      const { id, label = '', size, style, labelPoint = LABEL_POINT } = shape
      const font = getFontStyle(style)
      const styles = getShapeStyle(style, meta.isDarkMode)
      const Component = style.dash === DashStyle.Draw ? DrawTriangle : DashedTriangle
      const handleLabelChange = React.useCallback(
        (label: string) => onShapeChange?.({ id, label }),
        [onShapeChange]
      )
      const offsetY = React.useMemo(() => this.getLabelOffsetY(shape), [size])
      return (
        <FullWrapper ref={ref} {...events}>
          <TextLabel
            font={font}
            text={label}
            color={styles.stroke}
            offsetX={(labelPoint[0] - 0.5) * bounds.width}
            offsetY={offsetY + (labelPoint[1] - 0.5) * bounds.height}
            isEditing={isEditing}
            onChange={handleLabelChange}
            onBlur={onShapeBlur}
            shape={shape}
          />
          <SVGContainer
            id={shape.id + '_svg'}
            opacity={isGhost ? GHOSTED_OPACITY : 1}
            shapeStyle={style}
          >
            {isBinding && <TriangleBindingIndicator size={size} />}
            <Component
              id={id}
              style={style}
              size={size}
              isSelected={isSelected}
              isDarkMode={meta.isDarkMode}
            />
          </SVGContainer>
        </FullWrapper>
      )
    }
  )

  Indicator = TDShapeUtil.Indicator<T>(({ shape }) => {
    const { size } = shape
    return <polygon points={getTrianglePoints(size).join()} />
  })

  private getPoints(shape: T) {
    const {
      rotation = 0,
      point: [x, y],
      size: [w, h],
    } = shape
    return [
      [x + w / 2, y],
      [x, y + h],
      [x + w, y + h],
    ].map((pt) => Vec.rotWith(pt, this.getCenter(shape), rotation))
  }

  shouldRender = (prev: T, next: T) => {
    return next.size !== prev.size || next.style !== prev.style || next.label !== prev.label
  }

  getBounds = (shape: T) => {
    return getBoundsRectangle(shape, this.boundsCache)
  }

  getExpandedBounds = (shape: T) => {
    return Utils.getBoundsFromPoints(
      getTrianglePoints(shape.size, this.bindingDistance).map((pt) => Vec.add(pt, shape.point))
    )
  }

  hitTestLineSegment = (shape: T, A: number[], B: number[]): boolean => {
    return intersectLineSegmentPolyline(A, B, this.getPoints(shape)).didIntersect
  }

  hitTestBounds = (shape: T, bounds: TLBounds): boolean => {
    return (
      Utils.boundsContained(this.getBounds(shape), bounds) ||
      intersectBoundsPolygon(bounds, this.getPoints(shape)).length > 0
    )
  }

  getBindingPoint = <K extends TDShape>(
    shape: T,
    fromShape: K,
    point: number[],
    origin: number[],
    direction: number[],
    bindAnywhere: boolean
  ) => {
    // Algorithm time! We need to find the binding point (a normalized point inside of the shape, or around the shape, where the arrow will point to) and the distance from the binding shape to the anchor.

    const expandedBounds = this.getExpandedBounds(shape)

    if (!Utils.pointInBounds(point, expandedBounds)) return

    const points = getTrianglePoints(shape.size).map((pt) => Vec.add(pt, shape.point))

    const expandedPoints = getTrianglePoints(shape.size, this.bindingDistance).map((pt) =>
      Vec.add(pt, shape.point)
    )

    const closestDistanceToEdge = Utils.pointsToLineSegments(points, true)
      .map(([a, b]) => Vec.distanceToLineSegment(a, b, point))
      .sort((a, b) => a - b)[0]

    if (
      !(Utils.pointInPolygon(point, expandedPoints) || closestDistanceToEdge < this.bindingDistance)
    )
      return

    const intersections = Utils.pointsToLineSegments(expandedPoints.concat([expandedPoints[0]]))
      .map((segment) => intersectRayLineSegment(origin, direction, segment[0], segment[1]))
      .filter((intersection) => intersection.didIntersect)
      .flatMap((intersection) => intersection.points)

    if (!intersections.length) return

    // The center of the triangle
    const center = Vec.add(getTriangleCentroid(shape.size), shape.point)

    // Find furthest intersection between ray from origin through point and expanded bounds. TODO: What if the shape has a curve? In that case, should we intersect the circle-from-three-points instead?
    const intersection = intersections.sort((a, b) => Vec.dist(b, origin) - Vec.dist(a, origin))[0]

    // The point between the handle and the intersection
    const middlePoint = Vec.med(point, intersection)

    let anchor: number[]
    let distance: number

    if (bindAnywhere) {
      anchor = Vec.dist(point, center) < BINDING_DISTANCE / 2 ? center : point
      distance = 0
    } else {
      if (Vec.distanceToLineSegment(point, middlePoint, center) < BINDING_DISTANCE / 2) {
        anchor = center
      } else {
        anchor = middlePoint
      }

      if (Utils.pointInPolygon(point, points)) {
        distance = this.bindingDistance
      } else {
        distance = Math.max(this.bindingDistance, closestDistanceToEdge)
      }
    }

    const bindingPoint = Vec.divV(Vec.sub(anchor, [expandedBounds.minX, expandedBounds.minY]), [
      expandedBounds.width,
      expandedBounds.height,
    ])

    return {
      point: Vec.clampV(bindingPoint, 0, 1),
      distance,
    }
  }

  transform = transformRectangle

  transformSingle = transformSingleRectangle

  getSvgElement = (shape: T): SVGElement | void => {
    const elm = document.getElementById(shape.id + '_svg')?.cloneNode(true) as SVGElement
    if (!elm) return // possibly in test mode
    if ('label' in shape && (shape as any).label !== undefined) {
      const s = shape as TDShape & { label: string }
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const bounds = this.getBounds(shape)
      const font = getFontStyle(shape.style)
      const scale: number = shape.style.scale !== undefined ? shape.style.scale : 1
      const fontSize = getFontSize(shape.style.size, shape.style.font) * (shape.style.scale ?? 1)
      const fontFamily = getFontFace(shape.style.font).slice(1, -1)
      const size = getTextLabelSize(shape.label!, font)
      const labelElm = getTextSvgElement(
        s.label!,
        fontSize,
        fontFamily,
        AlignStyle.Middle,
        size[0],
        false
      )
      labelElm.setAttribute('fill', getShapeStyle(shape.style).stroke)
      labelElm.setAttribute('transform-origin', 'top left')

      // Put the label at the bend point with text aligned centered
      labelElm.setAttribute(
        'transform',
        `translate(${(bounds.width - size[0] * scale) / 2}, ${
          (bounds.height - size[1] * scale) / 2 + this.getLabelOffsetY(shape)
        })`
      )
      g.appendChild(elm)
      g.appendChild(labelElm)
      return g
    }
    return elm
  }

  getLabelOffsetY = (shape: TriangleShape): number => {
    const center = Vec.div(shape.size, 2)
    const centroid = getTriangleCentroid(shape.size)
    return (centroid[1] - center[1]) * 0.72
  }
}

const FullWrapper = styled('div', { width: '100%', height: '100%' })
