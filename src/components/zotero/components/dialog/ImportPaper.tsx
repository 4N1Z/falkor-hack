"use client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { useEffect, useState, useMemo } from "react";
import { ZoteroItem } from "../../types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { importPapers } from "../../actions";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

export default function ImportPaper({ workspaceId }: { workspaceId: string }) {
    const [start, setStart] = useState(0);
    const [selectedPapers, setSelectedPapers] = useState<{ key: string, isParent: boolean }[]>([]);
    const [papers, setPapers] = useState<ZoteroItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [importingLoading, setImportingLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [hasMoreItems, setHasMoreItems] = useState(true);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const [fetchError, setFetchError] = useState({
        active: false,
        status: 200,
        message: ''
    });
    // Zotero not linked yet: the list, search and Import button can't do anything, so the
    // dialog shows only the connect step instead of a broken-looking empty list.
    const notConnected = fetchError.active && fetchError.status === 401;
    // Return to this exact page after OAuth (set client-side to avoid an SSR mismatch)
    const [returnTo, setReturnTo] = useState(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`);
    useEffect(() => setReturnTo(window.location.href), []);

    const fetchPapers = async ({ limit, start, signal }: { limit: number, start: number, signal?: AbortSignal }) => {
        // Set loading state before any operation
        setLoading(true);
        setInitialLoadComplete(false);
        let searchParams = '';
        if (limit && start) {
            searchParams = `?limit=${limit}&start=${start}`;
        } else if (limit) {
            searchParams = `?limit=${limit}`;
        } else if (start) {
            searchParams = `?start=${start}`;
        }

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/zotero/items${searchParams}`, {
                signal: signal
            });
            const { status, message, data } = await response.json() as { status: number, message: string, data: null | ZoteroItem[] };

            if (status === 401) {
                setFetchError({
                    active: true,
                    status: status,
                    message: message
                });
                setLoading(false);
                setInitialLoadComplete(true);
                return;
            }

            if (status !== 200 || !data) {
                setFetchError({
                    active: true,
                    status: status,
                    message: message
                });
                setLoading(false);
                setInitialLoadComplete(true);
                return;
            }

            if (data.length === 0) {
                setHasMoreItems(false);
                setLoading(false);
                setInitialLoadComplete(true);
                return;
            }

            const existingKeys = new Set(papers.map(paper => paper.key));
            const newPapers = data.filter(paper => !existingKeys.has(paper.key));

            if (newPapers.length === 0) {
                setHasMoreItems(false);
                setLoading(false);
                setInitialLoadComplete(true);
                return;
            }

            setPapers(prevPapers => [...prevPapers, ...newPapers]);
            setFetchError({
                active: false,
                status: 200,
                message: ''
            });
        } catch (error) {
            setFetchError({
                active: true,
                status: 500,
                message: 'Failed to fetch papers'
            });
        } finally {
            setLoading(false);
            setInitialLoadComplete(true);
        }
    }

    useEffect(() => {
        // Set initial loading state
        setLoading(true);
        setInitialLoadComplete(false);
        
        const controller = new AbortController();
        
        // Add a small delay to ensure loading state is visible
        const timeoutId = setTimeout(() => {
            fetchPapers({ limit: 10, start: start, signal: controller.signal });
            setStart(start + 10);
        }, 100);

        return () => {
            clearTimeout(timeoutId);
            controller.abort({
                name: 'ComponentUnmount',
                message: 'Component was unmounted',
                code: 'UNMOUNT'
            });
            setPapers([]);
            setStart(0);
            setInitialLoadComplete(false);
            setLoading(true);
        }
    }, []);

    const handlePaperSelect = (paper: ZoteroItem) => {
        setSelectedPapers(prev => {
            let isParent = Boolean(!paper.links?.enclosure && paper.links?.attachment);

            if (!prev) return [{ key: paper.key, isParent }];

            if (prev.some(selected => selected.key === paper.key)) {
                return prev.filter(selected => selected.key !== paper.key);
            } else {
                return [...prev, { key: paper.key, isParent }];
            }
        });
    }

    const handleSelectAll = () => {
        if (selectedPapers.length === filteredPapers.length) {
            setSelectedPapers([]);
        } else {
            setSelectedPapers(filteredPapers.map(paper => ({
                key: paper.key,
                isParent: Boolean(paper.links?.enclosure && !paper.links?.attachment)
            })));
        }
    }

    const isPaperSelected = (paperKey: string) => {
        return selectedPapers.some(selected => selected.key === paperKey);
    }

    const handleImport = async () => {
        setImportingLoading(true);
        try {
            const res = await importPapers(selectedPapers, workspaceId);
            console.log('Import result:', res);
        } catch (error) {
            console.error('Import failed:', error);
        } finally {
            setImportingLoading(false);
        }
    }

    const filteredPapers = useMemo(() => {
        const normalizedSearchTerm = searchTerm.toLowerCase().trim();
        return papers.filter(paper =>
            !normalizedSearchTerm ||
            paper.data.title?.toLowerCase().includes(normalizedSearchTerm) ||
            paper.data.creators?.some(creator =>
                creator.firstName?.toLowerCase().includes(normalizedSearchTerm) ||
                creator.lastName?.toLowerCase().includes(normalizedSearchTerm)
            )
        );
    }, [papers, searchTerm]);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button type="submit" variant={"zotero"} className="font-sans">
                    <div className={cn("flex gap-2 justify-center items-center")}>
                        <Image
                            src={"/zotero.png"}
                            alt="zotero"
                            width={20}
                            height={20}
                            className="rounded-sm"
                        />
                        <p className="text-primary">Import from Zotero</p>
                    </div>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] font-sans">
                <DialogHeader>
                    <DialogTitle>Import Papers from Zotero</DialogTitle>
                    <DialogDescription className={cn("flex justify-between items-center gap-2", notConnected && "sr-only")}>
                        {notConnected ? (
                            "Connect your Zotero account to import papers."
                        ) : (
                            <Input
                                placeholder="Search for papers by title or author"
                                className="my-2"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        )}
                    </DialogDescription>
                </DialogHeader>
                {notConnected ? (
                    <div className="flex flex-col items-center text-center gap-4 pt-2 pb-1">
                        <Image src="/zotero.png" alt="" width={40} height={40} className="rounded-md" />
                        <div className="space-y-1.5">
                            <p className="font-medium text-foreground">Connect Zotero to import your library</p>
                            <p className="text-sm text-muted-foreground text-balance">
                                You&apos;ll sign in on zotero.org and come straight back here.
                                Imported papers join your team&apos;s research graph automatically.
                            </p>
                        </div>
                        <Link
                            href={`/api/zotero/auth?callback=${encodeURIComponent(returnTo)}`}
                            className={cn(
                                buttonVariants({ variant: "neuraShadow" }),
                                "w-full justify-center font-medium text-primary transition-transform duration-150 ease-out active:scale-[0.97]"
                            )}
                        >
                            Connect Zotero
                        </Link>
                    </div>
                ) : (
                <>
                <div className="w-full flex items-center justify-between">
                    <p className="text-base select-none pl-2">
                        Name of the paper
                    </p>
                    {selectedPapers.length > 0 && (
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                                Select all
                            </p>
                            <Checkbox
                                checked={selectedPapers.length === filteredPapers.length}
                                onCheckedChange={handleSelectAll}
                            />
                        </div>
                    )}
                </div>
                <Carousel
                    opts={{
                        align: "start",
                        containScroll: "trimSnaps",
                        loop: false,
                    }}
                    orientation="vertical"
                    className="w-full"
                >
                    <CarouselContent className="max-h-[300px] overflow-y-auto">
                        {(loading || !initialLoadComplete) ? (
                            <CarouselItem className="basis-full text-center">
                                <p className="py-8">Loading papers...</p>
                            </CarouselItem>
                        ) : filteredPapers.length > 0 ? (
                            filteredPapers.map((paper) => (
                                <CarouselItem key={paper.key} className="basis-full">
                                    <div
                                        className={`flex items-center justify-between gap-2 select-none hover:bg-input cursor-pointer p-2 rounded-sm ${isPaperSelected(paper.key) ? 'bg-input' : ''}`}
                                        title={paper.data.title}
                                        onClick={() => handlePaperSelect(paper)}
                                    >
                                        <div>
                                            <p className="font-semibold">
                                                {paper.data.title && paper.data.title.length > 70
                                                    ? `${paper.data.title?.slice(0, 70)}...`
                                                    : paper.data.title}
                                            </p>
                                            {paper.data.creators && (
                                                <p className="text-sm text-muted-foreground">
                                                    {paper.data.creators.map(creator =>
                                                        `${creator.firstName} ${creator.lastName}`
                                                    ).join(', ')}
                                                </p>
                                            )}
                                        </div>
                                        <Checkbox
                                            checked={isPaperSelected(paper.key)}
                                            onCheckedChange={() => handlePaperSelect(paper)}
                                        />
                                    </div>
                                </CarouselItem>
                            ))
                        ) : (
                            <CarouselItem className="basis-full text-center">
                                <p className="py-8">No papers found matching your search.</p>
                            </CarouselItem>
                        )}

                        {hasMoreItems && !fetchError.active && !loading && (
                            <CarouselItem className="basis-full">
                                <Button
                                    className="w-full justify-center"
                                    size="sm"
                                    variant="link"
                                    onClick={() => {
                                        fetchPapers({ limit: 10, start: start });
                                        setStart(start + 10);
                                    }}
                                >
                                    Load more
                                </Button>
                            </CarouselItem>
                        )}
                    </CarouselContent>
                </Carousel>
                <DialogFooter>
                    <Button
                        type="submit"
                        onClick={handleImport}
                        disabled={selectedPapers.length === 0 || importingLoading}
                        className="transition-transform duration-150 ease-out active:scale-[0.97]"
                    >
                        {importingLoading ? 'Importing...' : `Import (${selectedPapers.length})`}
                    </Button>
                </DialogFooter>
                </>
                )}
            </DialogContent>
        </Dialog>
    )
}