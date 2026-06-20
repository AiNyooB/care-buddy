import { createContext, useContext, useState, useCallback, useEffect, type ComponentProps } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from 'embla-carousel';

export type CarouselApi = EmblaCarouselType;

interface CarouselContextValue {
  emblaRef: (node: HTMLElement | null) => void;
  api: CarouselApi | null;
  canScrollPrev: boolean;
  canScrollNext: boolean;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within <Carousel>');
  return ctx;
}

interface CarouselProps {
  children: React.ReactNode;
  opts?: EmblaOptionsType;
  plugins?: EmblaPluginType[];
  setApi?: (api: CarouselApi) => void;
}

function Carousel({ children, opts, plugins, setApi }: CarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(opts, plugins);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback((api: CarouselApi) => {
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    setApi?.(emblaApi);
    emblaApi.on('reInit', onSelect);
    emblaApi.on('select', onSelect);
    onSelect(emblaApi);
    return () => {
      emblaApi.off('reInit', onSelect);
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, setApi, onSelect]);

  return (
    <CarouselContext value={{ emblaRef, api: emblaApi ?? null, canScrollPrev, canScrollNext }}>
      <div
        data-slot="carousel"
        className="relative"
        role="region"
        aria-roledescription="carousel"
      >
        {children}
      </div>
    </CarouselContext>
  );
}

function CarouselContent({ className, ...props }: ComponentProps<'div'>) {
  const { emblaRef } = useCarousel();
  return (
    <div
      ref={emblaRef}
      data-slot="carousel-content"
      className={cn('overflow-hidden', className)}
    >
      <div
        data-slot="carousel-content-inner"
        className="-ml-4 flex snap-x snap-mandatory"
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="carousel-item"
      className={cn('min-w-0 shrink-0 grow-0 basis-full snap-start pl-4', className)}
      {...props}
    />
  );
}

function CarouselPrevious({ className, ...props }: ComponentProps<typeof Button>) {
  const { api, canScrollPrev } = useCarousel();
  return (
    <Button
      variant="outline"
      size="icon"
      disabled={!canScrollPrev}
      className={cn('size-8 rounded-md border-border', className)}
      onClick={() => api?.scrollPrev()}
      {...props}
    >
      <ChevronLeft className="size-4" />
    </Button>
  );
}

function CarouselNext({ className, ...props }: ComponentProps<typeof Button>) {
  const { api, canScrollNext } = useCarousel();
  return (
    <Button
      variant="outline"
      size="icon"
      disabled={!canScrollNext}
      className={cn('size-8 rounded-md border-border', className)}
      onClick={() => api?.scrollNext()}
      {...props}
    >
      <ChevronRight className="size-4" />
    </Button>
  );
}

export { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext };