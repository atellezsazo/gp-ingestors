'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const template = require('./template');
const url = require('url');

const base_uri = "http://marischkaprudence.blogspot.com.br";
const rss_uri = "http://marischkaprudence.blogspot.com.br/feeds/posts/default";

// Remove elements (body)
const remove_elements = [
    'iframe',
    'noscript',
    'script',
    'style'
];

// clean attr (tag)
const remove_attr = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width'
];

// embed video
const video_iframes = [
    'youtube',
];

function ingest_article(hatch, obj) {
    const uri = obj.uri;
    return libingester.util.fetch_html(uri).then(($profile) => {
        const date_published = new Date(Date.parse(obj.updated));
        const synopsis = $profile('meta[property="og:description"]').attr('content');
        const title = $profile('meta[property="og:title"]').attr('content');

        // download videos
        const videos = $profile('.post-body iframe').first()[0];
        if (videos) {
            for (const video_iframe of video_iframes) {
                const video_url = videos.attribs.src;
                if (video_url.includes(video_iframe)) {
                    const full_uri = url.format(video_url, { search: false })
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(full_uri);
                    video_asset.set_last_modified_date(date_published);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(full_uri);
                    hatch.save_asset(video_asset);
                    return; 
                } else {
                    $profile('.post-body iframe').remove(); //Delete iframe container
                }
            }
        } else {
            const asset = new libingester.NewsArticle();
            const author = $profile('.pauthor a').first();   
            const category = $profile('.meta_categories');       
            const section = $profile('.meta_categories').text();

            // Set title section
            asset.set_title(title);
            asset.set_canonical_uri(uri);
            asset.set_last_modified_date(date_published);
            asset.set_synopsis(synopsis);
            asset.set_section(section);

            //Main image
            const main_img = $profile('meta[property="og:image"]').attr('content');
            const main_image = libingester.util.download_image(main_img);
            main_image.set_title(title);
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);

            // Download images
            $profile('.post-body img').map(function() {
                if (this.attribs.src) {
                    const image = libingester.util.download_img(this, base_uri);
                    image.set_title(title);
                    hatch.save_asset(image);
                    asset.set_thumbnail(image);

                    this.attribs['data-libingester-asset-id'] = image.asset_id;
                    for (const attr of remove_attr) {
                        delete this.attribs[attr];
                    }
                }
            });

            // remove elements (body)
            $profile('.post-body #related-posts').remove(); //Delete related posts
            for (const remove_element of remove_elements) {
                $profile(this).find(remove_element).remove();
            }

            let body = $profile('.post-body').first();

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
        }
    }).catch((err) => {
        console.log(err);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const posts = new Promise((resolve, reject) => {
        libingester.util.fetch_html(rss_uri).then(($) => {
            const objects = $('entry').map(function() {
                return {
                    updated: $(this).find('updated').text(),
                    uri: $(this).find('link[rel="alternate"]').attr('href'),
                }
            }).get();
            Promise.map(objects, (obj) => ingest_article(hatch, obj)).then(() => {
                return hatch.finish();
            });
        });
    });
}

main();