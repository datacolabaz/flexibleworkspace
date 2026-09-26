import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationPickerMap } from '@/components/features/provider/LocationPickerMap';

const mapboxMocks = vi.hoisted(() => ({
  mapConstructor: vi.fn(),
  markerSetLngLat: vi.fn(),
  markerAddTo: vi.fn(),
  markerOn: vi.fn(),
  mapFlyTo: vi.fn(),
  mapOn: vi.fn(),
  mapRemove: vi.fn(),
  mapAddControl: vi.fn(),
  mapGetZoom: vi.fn(() => 14),
}));

vi.mock('@/lib/maps/loadMapbox', () => ({
  loadMapboxGl: vi.fn(async () => {
    class MapMock {
      constructor(options: unknown) {
        mapboxMocks.mapConstructor(options);
      }

      addControl(control: unknown, position: string) {
        mapboxMocks.mapAddControl(control, position);
      }

      on(event: string, callback: unknown) {
        mapboxMocks.mapOn(event, callback);
      }

      flyTo(options: unknown) {
        mapboxMocks.mapFlyTo(options);
      }

      getZoom() {
        return mapboxMocks.mapGetZoom();
      }

      remove() {
        mapboxMocks.mapRemove();
      }
    }

    class MarkerMock {
      setLngLat(position: unknown) {
        mapboxMocks.markerSetLngLat(position);
        return this;
      }

      addTo(map: unknown) {
        mapboxMocks.markerAddTo(map);
        return this;
      }

      on(event: string, callback: unknown) {
        mapboxMocks.markerOn(event, callback);
        return this;
      }

      getLngLat() {
        return { lat: 40.3777, lng: 49.892 };
      }
    }

    return {
      Map: MapMock,
      Marker: MarkerMock,
      NavigationControl: class NavigationControlMock {},
    };
  }),
}));

describe('LocationPickerMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('moves both marker and viewport when geocoded coordinate props change', async () => {
    const onChange = vi.fn();
    const view = render(
      <LocationPickerMap lat={40.3777} lng={49.892} onChange={onChange} />,
    );

    await waitFor(() => expect(mapboxMocks.mapConstructor).toHaveBeenCalled());
    view.rerender(
      <LocationPickerMap lat={40.4093} lng={49.8372} onChange={onChange} />,
    );

    expect(mapboxMocks.markerSetLngLat).toHaveBeenLastCalledWith([
      49.8372,
      40.4093,
    ]);
    expect(mapboxMocks.mapFlyTo).toHaveBeenLastCalledWith({
      center: [49.8372, 40.4093],
      zoom: 15,
      essential: true,
    });
  });
});
