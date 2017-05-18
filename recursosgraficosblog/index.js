'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = "https://recursosgraficosblog.wordpress.com";
const rss_uri = "https://recursosgraficosblog.wordpress.com/feeds/posts/default";

// Remove elements (body)
const remove_elements = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.wpcnt',
    '#jp-post-flair',
    '.on-date',
    '.by-author'
];

// clean attr (tag)
const remove_attr = [
    'border',
    'class',
    'data-attachment-id',
    'data-permalink',
    'data-orig-file',
    'data-orig-size',
    'data-comments-opened',
    'data-image-meta',
    'data-image-title',
    'data-image-description',
    'data-medium-file',
    'data-large-file',
    'dir',
    'height',
    'id',
    'imageanchor',
    'lang',
    'rel',
    'sizes',
    'src',
    'srcset',
    'style',
    'trbidi',
    'width'
];

// clean attr (tag)
const clear_tags = [
    'a',
    'b',
    'br',
    'h3',
    'i',
    'img',
    'li',
    'p',
    'span'
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        
        const author = $profile('.by-author .author a').map(function() {
            for (const attr of remove_attr) {
                delete this.attribs[attr];
            }
            return $profile(this);
        }).get();   

        let section = [];
        const category = $profile('.entry-meta a[rel*=tag]').map(function() {
            for (const attr of remove_attr) {
                delete this.attribs[attr];
            }

            section.push($profile(this).text());
            return $profile(this);
        }).get();

        const date_published = new Date(Date.parse($profile('meta[property="article:published_time"]').attr('content')));
        const date_modified = new Date(Date.parse($profile('meta[property="article:modified_time"]').attr('content')));
        const synopsis = $profile('meta[property="og:description"]').attr('content');
        const title = $profile('meta[property="og:title"]').attr('content');

        // Set title section
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(date_published);
        asset.set_synopsis(synopsis);
        asset.set_section(section.join(','));

        //Main image
        const main_img = $profile('meta[property="og:image"]').attr('content');
        const main_image = libingester.util.download_image(main_img);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        // Download images
        $profile('.entry-content img').map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs['data-libingester-asset-id'] = image.asset_id;
            }
        });

        const body = $profile('.entry-content').first();
        
        // remove elements (body)
        for (const element of remove_elements) {
            body.find(element).remove();
        }

        // clear tags (body)
        for (const tag of clear_tags) {
            body.find(tag).map(function() {
                for (const attr of remove_attr) {
                    delete this.attribs[attr];
                }
            });
        }

        const content = mustache.render(template.structure_template, {
            category: category,
            author: author,
            date_published: date_published,
            title: title,
            body: body.html(),
        });

        // save document
        asset.set_document(content);
        hatch.save_asset(asset);
        return asset;
    }).catch((err) => {
        console.log(err);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, (err, rss) => {
        const news_uris = rss.items.map((datum) => datum.link);
        Promise.all(news_uris.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();