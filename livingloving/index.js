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
    '.sharedaddy', //share elements
    '[id*="more-"]', //more span
];

//embed content
const video_iframes = [
    'youtube', //YouTube
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));

        //by information 
        const article_entry = $profile('.post .post-heading .meta').first();
        const article_data = $profile(article_entry).text().split(' • ');
        const author = article_data[0];
        const date_published = article_data[1];
        const category = article_data[2];

        //Tags
        const post_tags = $profile('.post-tags').first().children();

        const section = $profile('a[rel="category tag"]').map(function() {
            return $profile(this).text();
        }).get();

        asset.set_section(section.join(", "));

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        const synopsis = $profile('meta[property="og:description"]').attr('content');

        const meta = $profile('.post .post-heading .meta').first();
        meta.find(".bullet").remove();
        asset.set_title(title);
        asset.set_synopsis(synopsis);

        const main_img = $profile('.post-img a img');
        const main_image = libingester.util.download_img(main_img, base_uri);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        const body = $profile('.post-entry').first();

        //Download images 
        body.find("img").map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const img_meta of img_metadata) {
                    delete this.attribs[img_meta];
                }
            }
        });

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        // replace '---' by tag (hr)
        const parraf = body.find('p[style="text-align: center;"]').first();
        if (parraf.text().indexOf('_') != -1) {
            parraf[0].children = { type: 'tag', name: 'hr' };
        }

        const content = mustache.render(template.structure_template, {
            title: title,
            category: category,
            author: author,
            date_published: date_published,
            main_image: main_image,
            body: body.html(),
            post_tags: post_tags,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, function(err, rss) {
        const articles_links = rss.items.map((datum) => datum.url);
        Promise.all(articles_links.map((uri) => ingest_article(hatch, uri))).then(() => hatch.finish());
    });
}

main();