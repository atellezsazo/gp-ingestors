'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');
const rss2json = require('rss-to-json');

const rss_uri = "http://www.livingloving.net/feed/";

//Remove metadata
const img_metadata = [
    'class',
    'data-jpibfi-indexer',
    'data-jpibfi-post-excerpt',
    'data-jpibfi-post-url',
    'data-jpibfi-post-title',
    'height',
    'id',
    'rscset',
    'sizes',
    'src',
    'width',
];

//Remove elements
const remove_elements = [
    'iframe',
    'input',
    'noscript', //any script injection
    'script', //any script injection
    '.link_pages', //recomendation links
    '.jp-relatedposts', //related posts
    '.post-tags', //Tags
    '[id*="more-"]', //more span
];

//embed content
const video_iframes = [
    'youtube', //YouTube
];

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));

        const section = $profile('a[rel="category tag"]').map(function() {
            return $profile(this).text();
        }).get();

        asset.set_section(section.join(" "));

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        const meta = $profile('.post .post-heading .meta').first();
        meta.find(".bullet").remove();
        asset.set_title(title);

        const main_img = $profile('.post-img a img');
        const main_image = libingester.util.download_img(main_img, base_uri);
        hatch.save_asset(main_image);

        const body = $profile('.post-entry').first();

        //Download images 
        body.find("img").map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const img_meta of img_metadata) {
                    delete this.attribs[img_meta];
                }
            }
        });

        //Download videos 
        body.find("iframe").map(function() {
            const iframe_src = this.attribs.src;
            for (const video_iframe of video_iframes) {
                if (iframe_src.includes(video_iframe)) {
                    const video_url = this.attribs.src;
                    const full_uri = url.format(video_url, { search: false })
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(full_uri);
                    video_asset.set_last_modified_date(modified_date);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(full_uri);
                    hatch.save_asset(video_asset);
                }
            }
        });

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        const content = mustache.render(template.structure_template, {
            title: title,
            meta: meta.html(),
            main_image: main_image,
            body: body.html()
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, function(err, rss) {
        const rss_uris = rss.items.map((datum) => datum.url);
        Promise.all(rss_uris.map((uri) => ingest_article_profile(hatch, uri)))
            .then(() => {
                return hatch.finish();
            });
    });
}

main();