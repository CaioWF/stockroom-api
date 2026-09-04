/**
 * Patches the installed zod runtime with `.openapi()` (side effect only, no
 * exports). Every sibling file in this directory that calls `.openapi()` at
 * module scope imports this FIRST — `extendZodWithOpenApi` must run before
 * the method it adds is ever called, and static imports execute in
 * dependency order, so this file being each schema module's first import
 * guarantees that regardless of which module Node loads first. The library
 * no-ops a second call (it checks whether the method already exists before
 * patching), so importing this repeatedly across sibling files is safe.
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);
